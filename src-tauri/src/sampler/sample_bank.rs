use hound::{SampleFormat, WavReader, WavSpec, WavWriter};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

// ─── Types publics ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleInfo {
    pub id: u32,
    pub name: String,
    pub category: String,
    /// Chemin relatif depuis le dossier samples/.
    pub path: String,
    pub duration_ms: u32,
    /// 128 points normalisés pour la mini waveform.
    pub waveform: Vec<f32>,
    pub tags: Vec<String>,
}

/// Banque de samples chargés en mémoire.
/// Les données audio sont stockées comme Arc<Vec<f32>> pour être partagées
/// sans copie avec le thread audio.
pub struct SampleBank {
    pub samples: Vec<SampleInfo>,
    /// Données audio par sample_id : frames f32 entrelacées.
    pub audio_data: Vec<(Arc<Vec<f32>>, u16, u32)>, // (frames, channels, sample_rate)
}

impl SampleBank {
    pub fn new() -> Self {
        Self {
            samples: Vec::new(),
            audio_data: Vec::new(),
        }
    }
}

// ─── Lecture WAV ──────────────────────────────────────────────────────────────

/// Charge un fichier WAV et retourne les frames f32 entrelacées + (channels, sample_rate).
pub fn load_wav(path: &Path) -> Result<(Vec<f32>, u16, u32), String> {
    let reader = WavReader::open(path).map_err(|e| format!("WavReader: {e}"))?;
    let spec = reader.spec();
    let sample_rate = spec.sample_rate;
    let channels = spec.channels;

    let frames: Vec<f32> = match spec.sample_format {
        SampleFormat::Float => reader
            .into_samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Lecture float: {e}"))?,
        SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .into_samples::<i32>()
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Lecture int: {e}"))?
                .into_iter()
                .map(|s| s as f32 / max)
                .collect()
        }
    };

    Ok((frames, channels, sample_rate))
}

/// Calcule une waveform de `num_points` valeurs peak normalisées.
pub fn compute_waveform(frames: &[f32], channels: u16, num_points: usize) -> Vec<f32> {
    let num_mono_frames = frames.len() / channels as usize;
    if num_mono_frames == 0 || num_points == 0 {
        return vec![0.0; num_points];
    }
    let chunk_size = (num_mono_frames / num_points).max(1);
    let mut waveform = Vec::with_capacity(num_points);

    for i in 0..num_points {
        let start = i * chunk_size * channels as usize;
        let end = ((i + 1) * chunk_size * channels as usize).min(frames.len());
        let peak = frames[start..end]
            .iter()
            .map(|s| s.abs())
            .fold(0.0f32, f32::max);
        waveform.push(peak);
    }
    waveform
}

// ─── Génération de samples synthétiques ──────────────────────────────────────

fn write_wav(path: &Path, samples: &[f32], sample_rate: u32) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("mkdir: {e}"))?;
    }
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let mut writer = WavWriter::create(path, spec).map_err(|e| format!("WavWriter: {e}"))?;
    for &s in samples {
        let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
        writer.write_sample(v).map_err(|e| format!("write_sample: {e}"))?;
    }
    writer.finalize().map_err(|e| format!("finalize: {e}"))?;
    Ok(())
}

/// Enveloppe ADSR simple (retourne un multiplicateur 0..1).
fn adsr(t: f32, attack: f32, decay: f32, sustain: f32, release_start: f32, total: f32) -> f32 {
    if t < attack {
        t / attack
    } else if t < attack + decay {
        1.0 - (1.0 - sustain) * (t - attack) / decay
    } else if t < release_start {
        sustain
    } else {
        let r = total - release_start;
        if r <= 0.0 { 0.0 } else { sustain * (1.0 - (t - release_start) / r) }
    }
}

fn gen_kick(sr: u32) -> Vec<f32> {
    let dur = 0.5f32;
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            let freq = 100.0 * (-30.0 * t).exp() + 40.0;
            let env = adsr(t, 0.002, 0.1, 0.0, 0.15, dur);
            (2.0 * std::f32::consts::PI * freq * t).sin() * env * 0.9
        })
        .collect()
}

fn gen_snare(sr: u32) -> Vec<f32> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let dur = 0.3f32;
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            // Pseudo-random noise via hashing
            let mut h = DefaultHasher::new();
            i.hash(&mut h);
            let noise = ((h.finish() as f32 / u64::MAX as f32) * 2.0 - 1.0) * 0.8;
            let env = adsr(t, 0.001, 0.05, 0.1, 0.1, dur);
            noise * env
        })
        .collect()
}

fn gen_hihat(sr: u32, open: bool) -> Vec<f32> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let dur = if open { 0.4f32 } else { 0.08f32 };
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            let mut h = DefaultHasher::new();
            i.hash(&mut h);
            let noise = (h.finish() as f32 / u64::MAX as f32) * 2.0 - 1.0;
            // High-pass simple : différence avec sample précédent
            let env = adsr(t, 0.001, 0.02, if open { 0.3 } else { 0.0 }, dur * 0.6, dur);
            noise * env * 0.5
        })
        .collect()
}

fn gen_clap(sr: u32) -> Vec<f32> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let dur = 0.25f32;
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            let mut h = DefaultHasher::new();
            i.hash(&mut h);
            let noise = (h.finish() as f32 / u64::MAX as f32) * 2.0 - 1.0;
            // 3 bursts courts espacés de ~10ms
            let burst1 = (-80.0 * t).exp();
            let burst2 = (-80.0 * (t - 0.01).max(0.0)).exp() * if t > 0.01 { 1.0 } else { 0.0 };
            let burst3 = (-80.0 * (t - 0.02).max(0.0)).exp() * if t > 0.02 { 1.0 } else { 0.0 };
            noise * (burst1 + burst2 + burst3) * 0.4
        })
        .collect()
}

fn gen_tom(sr: u32, start_freq: f32) -> Vec<f32> {
    let dur = 0.4f32;
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            let freq = start_freq * (-8.0 * t).exp() + 60.0;
            let env = adsr(t, 0.002, 0.1, 0.0, 0.15, dur);
            (2.0 * std::f32::consts::PI * freq * t).sin() * env * 0.85
        })
        .collect()
}

fn gen_sine_note(sr: u32, freq: f32, dur_secs: f32) -> Vec<f32> {
    let n = (sr as f32 * dur_secs) as usize;
    let attack = 0.01f32;
    let release_start = dur_secs * 0.7;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            let env = adsr(t, attack, 0.1, 0.7, release_start, dur_secs);
            (2.0 * std::f32::consts::PI * freq * t).sin() * env * 0.7
        })
        .collect()
}

fn gen_bass_note(sr: u32, freq: f32) -> Vec<f32> {
    let dur = 0.8f32;
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            let env = adsr(t, 0.01, 0.1, 0.6, 0.5, dur);
            // Saw wave simplifié
            let phase = (freq * t).fract();
            (2.0 * phase - 1.0) * env * 0.6
        })
        .collect()
}

fn gen_animal_cat(sr: u32) -> Vec<f32> {
    let dur = 0.6f32;
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            // Sweep montant puis descendant
            let freq = 400.0 + 600.0 * (-(t - 0.3).powi(2) / 0.03).exp();
            let env = adsr(t, 0.05, 0.1, 0.5, 0.3, dur);
            (2.0 * std::f32::consts::PI * freq * t).sin() * env * 0.7
        })
        .collect()
}

fn gen_effect_woosh(sr: u32) -> Vec<f32> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let dur = 0.8f32;
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            let mut h = DefaultHasher::new();
            i.hash(&mut h);
            let noise = (h.finish() as f32 / u64::MAX as f32) * 2.0 - 1.0;
            let sweep = (400.0 * (1.0 - t / dur) + 100.0 * t / dur) * t;
            let tone = (2.0 * std::f32::consts::PI * sweep).sin() * 0.3;
            let env = adsr(t, 0.1, 0.2, 0.3, 0.5, dur);
            (noise * 0.3 + tone) * env
        })
        .collect()
}

fn gen_effect_boing(sr: u32) -> Vec<f32> {
    let dur = 0.5f32;
    let n = (sr as f32 * dur) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / sr as f32;
            let freq = 800.0 * (-5.0 * t).exp() + 200.0;
            let env = adsr(t, 0.001, 0.05, 0.3, 0.2, dur);
            (2.0 * std::f32::consts::PI * freq * t).sin() * env * 0.8
        })
        .collect()
}

fn gen_melody_loop(sr: u32) -> Vec<f32> {
    // Boucle rythmique simple : 4 notes do-mi-sol-do
    let bpm = 120.0f32;
    let beat = 60.0 / bpm;
    let notes = [261.63f32, 329.63, 392.0, 523.25]; // C4 E4 G4 C5
    let dur_total = beat * 4.0;
    let n = (sr as f32 * dur_total) as usize;
    let mut buf = vec![0.0f32; n];

    for (beat_idx, &freq) in notes.iter().enumerate() {
        let start = (beat_idx as f32 * beat * sr as f32) as usize;
        let note_dur = beat * 0.8;
        let note_n = (note_dur * sr as f32) as usize;
        for j in 0..note_n {
            if start + j >= n { break; }
            let t = j as f32 / sr as f32;
            let env = adsr(t, 0.01, 0.05, 0.7, note_dur * 0.6, note_dur);
            buf[start + j] += (2.0 * std::f32::consts::PI * freq * t).sin() * env * 0.6;
        }
    }
    buf
}

// ─── ensure_samples_exist ─────────────────────────────────────────────────────

/// Structure d'un sample dans metadata.json
#[derive(Debug, Serialize, Deserialize)]
struct MetadataEntry {
    id: u32,
    name: String,
    category: String,
    path: String,
    duration_ms: u32,
    waveform: Vec<f32>,
    tags: Vec<String>,
}

/// Génère les samples synthétiques si le dossier samples/ est absent ou vide.
/// Retourne le chemin du dossier samples.
pub fn ensure_samples_exist(app_data_dir: &Path) -> PathBuf {
    let samples_dir = app_data_dir.join("samples");

    // Si metadata.json existe déjà, on ne régénère pas.
    let meta_path = samples_dir.join("metadata.json");
    if meta_path.exists() {
        return samples_dir;
    }

    println!("[SampleBank] Génération des samples synthétiques dans {:?}", samples_dir);

    let sr = 48000u32;
    let mut entries: Vec<MetadataEntry> = Vec::new();
    let mut id = 0u32;

    macro_rules! add_sample {
        ($subdir:expr, $filename:expr, $name:expr, $cat:expr, $tags:expr, $data:expr) => {{
            let rel = format!("{}/{}", $subdir, $filename);
            let full = samples_dir.join(&rel);
            let data = $data;
            let dur_ms = (data.len() as f32 / sr as f32 * 1000.0) as u32;
            let waveform = compute_waveform(&data, 1, 128);
            if let Err(e) = write_wav(&full, &data, sr) {
                eprintln!("[SampleBank] Erreur génération {}: {e}", $filename);
            }
            entries.push(MetadataEntry {
                id,
                name: $name.to_string(),
                category: $cat.to_string(),
                path: rel,
                duration_ms: dur_ms,
                waveform,
                tags: $tags.iter().map(|s: &&str| s.to_string()).collect(),
            });
            id += 1;
        }};
    }

    // Drums
    add_sample!("drums/kicks",   "kick_01.wav",  "Grosse caisse 1", "drums", &["kick","bass"], gen_kick(sr));
    add_sample!("drums/kicks",   "kick_02.wav",  "Grosse caisse 2", "drums", &["kick","bass"], gen_kick(sr));
    add_sample!("drums/snares",  "snare_01.wav", "Caisse claire 1", "drums", &["snare"], gen_snare(sr));
    add_sample!("drums/snares",  "snare_02.wav", "Caisse claire 2", "drums", &["snare"], gen_snare(sr));
    add_sample!("drums/hihats",  "hihat_cl.wav", "Charley fermé",   "drums", &["hihat","closed"], gen_hihat(sr, false));
    add_sample!("drums/hihats",  "hihat_op.wav", "Charley ouvert",  "drums", &["hihat","open"], gen_hihat(sr, true));
    add_sample!("drums/claps",   "clap_01.wav",  "Clap 1",          "drums", &["clap"], gen_clap(sr));
    add_sample!("drums/toms",    "tom_hi.wav",   "Tom aigu",        "drums", &["tom"], gen_tom(sr, 250.0));
    add_sample!("drums/toms",    "tom_lo.wav",   "Tom grave",       "drums", &["tom"], gen_tom(sr, 180.0));

    // Instruments – piano (notes C4..C5)
    let piano_notes = [
        ("do_c4.wav", "Do (C4)", 261.63f32),
        ("re_d4.wav", "Ré (D4)", 293.66),
        ("mi_e4.wav", "Mi (E4)", 329.63),
        ("fa_f4.wav", "Fa (F4)", 349.23),
        ("sol_g4.wav","Sol (G4)", 392.0),
        ("la_a4.wav", "La (A4)", 440.0),
        ("si_b4.wav", "Si (B4)", 493.88),
        ("do_c5.wav", "Do (C5)", 523.25),
    ];
    for (file, name, freq) in &piano_notes {
        add_sample!("instruments/piano", file, *name, "instruments", &["piano","melodic"], gen_sine_note(sr, *freq, 1.5));
    }

    // Instruments – guitare (accords)
    add_sample!("instruments/guitar", "chord_c.wav",  "Accord Do",  "instruments", &["guitar","chord"], gen_sine_note(sr, 261.63, 1.0));
    add_sample!("instruments/guitar", "chord_g.wav",  "Accord Sol", "instruments", &["guitar","chord"], gen_sine_note(sr, 392.0,  1.0));
    add_sample!("instruments/guitar", "chord_am.wav", "Accord Lam", "instruments", &["guitar","chord"], gen_sine_note(sr, 220.0,  1.0));
    add_sample!("instruments/guitar", "chord_f.wav",  "Accord Fa",  "instruments", &["guitar","chord"], gen_sine_note(sr, 349.23, 1.0));

    // Instruments – bass
    add_sample!("instruments/bass", "bass_c2.wav", "Basse Do", "instruments", &["bass"], gen_bass_note(sr, 65.41));
    add_sample!("instruments/bass", "bass_g2.wav", "Basse Sol","instruments", &["bass"], gen_bass_note(sr, 98.0));

    // Mélodies
    add_sample!("melodies/loops", "loop_cmaj.wav", "Boucle Do majeur", "melodies", &["loop","melodic"], gen_melody_loop(sr));
    add_sample!("melodies/oneshots", "note_c4.wav", "Note Do 4",  "melodies", &["oneshot"], gen_sine_note(sr, 261.63, 0.8));
    add_sample!("melodies/oneshots", "note_e4.wav", "Note Mi 4",  "melodies", &["oneshot"], gen_sine_note(sr, 329.63, 0.8));
    add_sample!("melodies/oneshots", "note_g4.wav", "Note Sol 4", "melodies", &["oneshot"], gen_sine_note(sr, 392.0,  0.8));

    // Fun – animaux
    add_sample!("fun/animals", "cat.wav",  "Chat 🐱",   "fun", &["animal","cat"],  gen_animal_cat(sr));
    add_sample!("fun/animals", "cat2.wav", "Chaton 🐱", "fun", &["animal","cat"],  gen_animal_cat(sr));

    // Fun – effets
    add_sample!("fun/effects", "woosh.wav", "Swoosh 💨", "fun", &["effect","swoosh"], gen_effect_woosh(sr));
    add_sample!("fun/effects", "boing.wav", "Boing 🎈",  "fun", &["effect","boing"],  gen_effect_boing(sr));
    add_sample!("fun/effects", "pop.wav",   "Pop 🫧",    "fun", &["effect","pop"],    gen_effect_boing(sr));

    // Sauvegarder metadata.json
    let json = serde_json::to_string_pretty(&entries)
        .unwrap_or_else(|_| "[]".to_string());
    if let Err(e) = std::fs::write(&meta_path, json) {
        eprintln!("[SampleBank] Erreur écriture metadata.json: {e}");
    } else {
        println!("[SampleBank] {} samples générés.", entries.len());
    }

    samples_dir
}

/// Charge la banque de samples depuis le dossier fourni.
pub fn load_sample_bank(samples_dir: &Path) -> SampleBank {
    let mut bank = SampleBank::new();
    let meta_path = samples_dir.join("metadata.json");

    let json = match std::fs::read_to_string(&meta_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[SampleBank] Impossible de lire metadata.json: {e}");
            return bank;
        }
    };

    let entries: Vec<MetadataEntry> = match serde_json::from_str(&json) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[SampleBank] Erreur désérialisation metadata.json: {e}");
            return bank;
        }
    };

    for entry in entries {
        let full_path = samples_dir.join(&entry.path);
        let audio = match load_wav(&full_path) {
            Ok(a) => a,
            Err(e) => {
                eprintln!("[SampleBank] Impossible de charger {}: {e}", entry.path);
                continue;
            }
        };

        bank.samples.push(SampleInfo {
            id: entry.id,
            name: entry.name,
            category: entry.category,
            path: entry.path,
            duration_ms: entry.duration_ms,
            waveform: entry.waveform,
            tags: entry.tags,
        });

        // Garantir que audio_data est indexé par id.
        let idx = bank.samples.last().unwrap().id as usize;
        while bank.audio_data.len() <= idx {
            bank.audio_data.push((Arc::new(Vec::new()), 1, 48000));
        }
        bank.audio_data[idx] = (Arc::new(audio.0), audio.1, audio.2);
    }

    println!("[SampleBank] {} samples chargés.", bank.samples.len());
    bank
}
