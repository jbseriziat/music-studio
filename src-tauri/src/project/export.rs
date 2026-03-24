use hound::{SampleFormat, WavSpec, WavWriter};
use serde::{Deserialize, Serialize};

use crate::project::MspProject;
use crate::sampler::SampleBank;

// ─── Options d'export ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    /// Format de sortie : "wav" (seul format supporté pour l'instant).
    pub format: String,
    /// Normaliser le signal final pour atteindre 0 dBFS.
    pub normalize: bool,
    /// Sample rate de sortie : 44100 ou 48000.
    pub sample_rate: u32,
    /// Profondeur de bits : 16 ou 32 (uniquement WAV, ignoré sinon).
    pub bit_depth: u16,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            format: "wav".to_string(),
            normalize: false,
            sample_rate: 48_000,
            bit_depth: 32,
        }
    }
}

// ─── Moteur de rendu offline ──────────────────────────────────────────────────

/// Effectue un rendu offline du projet en mixant tous les clips audio des pistes.
///
/// Note : cette implémentation rend les clips audio (pistes de type "audio").
/// Les patterns drum et les notes synth ne sont pas rendus dans cette version
/// (le rendu complet de ceux-ci nécessite le callback temps-réel du moteur audio).
///
/// `progress_cb` est appelée avec une valeur entre 0.0 et 1.0.
pub fn render_project_to_wav(
    project: &MspProject,
    bank: &SampleBank,
    output_path: &str,
    options: &ExportOptions,
    progress_cb: impl Fn(f32),
) -> Result<(), String> {
    let sr = options.sample_rate;

    // ── 1. Calculer la durée totale (en frames) ────────────────────────────
    let total_frames = calculate_duration_frames(project, sr);
    if total_frames == 0 {
        return Err("Le projet est vide (aucun clip audio)".to_string());
    }

    progress_cb(0.02);

    // ── 2. Allouer les buffers de mixage gauche + droite ──────────────────
    let mut mix_l = vec![0.0f32; total_frames];
    let mut mix_r = vec![0.0f32; total_frames];

    // ── 3. Mélanger tous les clips audio ──────────────────────────────────
    let track_count = project.tracks.len().max(1);
    for (track_idx, track) in project.tracks.iter().enumerate() {
        if track.muted {
            continue;
        }
        // Type de piste : seuls les clips audio sont rendus ici.
        let track_type = track.track_type.as_deref().unwrap_or("audio");
        if track_type != "audio" {
            continue;
        }

        // Pan constant-power
        let pan = track.pan.clamp(-1.0, 1.0);
        let angle = (pan + 1.0) * std::f32::consts::FRAC_PI_4;
        let pan_l = angle.cos() * track.volume;
        let pan_r = angle.sin() * track.volume;

        for clip in &track.clips {
            let sample_id = clip.sample_id as usize;
            let Some((audio_data, channels, clip_sr)) = bank.audio_data.get(sample_id) else {
                continue;
            };
            let clip_sr = *clip_sr;
            let channels = *channels;

            // Position de début dans le buffer de sortie.
            let start_frame = (clip.position * sr as f64) as usize;
            // Durée du clip en frames source.
            let src_frames = audio_data.len() / channels as usize;
            // Durée du clip en frames de sortie (avec re-sampling éventuel).
            let ratio = clip_sr as f64 / sr as f64;
            let out_frames = ((src_frames as f64 / ratio) as usize).min(total_frames - start_frame);

            for i in 0..out_frames {
                let src_pos = i as f64 * ratio;
                let src_idx = src_pos as usize;
                let frac = (src_pos - src_idx as f64) as f32;
                let next_src = (src_idx + 1).min(src_frames - 1);

                let base      = src_idx * channels as usize;
                let next_base = next_src * channels as usize;

                // Interpolation linéaire gauche.
                let sl = audio_data[base]
                    + (audio_data[next_base] - audio_data[base]) * frac;
                // Interpolation linéaire droite (ou mono dupliqué).
                let sr_sample = if channels > 1 {
                    let b1 = base + 1;
                    let n1 = next_base + 1;
                    audio_data[b1] + (audio_data[n1] - audio_data[b1]) * frac
                } else {
                    sl
                };

                let out_idx = start_frame + i;
                if out_idx < total_frames {
                    mix_l[out_idx] += sl * pan_l;
                    mix_r[out_idx] += sr_sample * pan_r;
                }
            }
        }

        progress_cb(0.02 + 0.70 * (track_idx + 1) as f32 / track_count as f32);
    }

    progress_cb(0.72);

    // ── 4. Normalisation (optionnelle) ────────────────────────────────────
    if options.normalize {
        let peak = mix_l
            .iter()
            .chain(mix_r.iter())
            .map(|s| s.abs())
            .fold(0.0f32, f32::max);
        if peak > 0.0 {
            let gain = 0.99 / peak;
            for s in mix_l.iter_mut().chain(mix_r.iter_mut()) {
                *s *= gain;
            }
        }
    }

    progress_cb(0.78);

    // ── 5. Créer le dossier parent si nécessaire ──────────────────────────
    if let Some(parent) = std::path::Path::new(output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Création dossier export: {e}"))?;
    }

    // ── 6. Écrire le WAV ──────────────────────────────────────────────────
    write_wav(
        &mix_l,
        &mix_r,
        total_frames,
        output_path,
        options,
        &progress_cb,
    )?;

    progress_cb(1.0);
    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Calcule la durée totale en frames de sortie à partir des clips du projet.
fn calculate_duration_frames(project: &MspProject, sr: u32) -> usize {
    let mut max_end = 0.0f64;
    for track in &project.tracks {
        for clip in &track.clips {
            let end = clip.position + clip.duration;
            if end > max_end {
                max_end = end;
            }
        }
    }
    // Ajouter 0.5s de marge de queue.
    let with_tail = max_end + 0.5;
    (with_tail * sr as f64) as usize
}

/// Écrit les buffers L+R dans un fichier WAV.
fn write_wav(
    mix_l: &[f32],
    mix_r: &[f32],
    frames: usize,
    path: &str,
    options: &ExportOptions,
    progress_cb: &impl Fn(f32),
) -> Result<(), String> {
    let spec = WavSpec {
        channels: 2,
        sample_rate: options.sample_rate,
        bits_per_sample: options.bit_depth,
        sample_format: if options.bit_depth == 32 {
            SampleFormat::Float
        } else {
            SampleFormat::Int
        },
    };

    let mut writer = WavWriter::create(path, spec)
        .map_err(|e| format!("WavWriter::create: {e}"))?;

    let report_every = (frames / 20).max(1); // mettre à jour la progression ~20x

    if options.bit_depth == 32 {
        for i in 0..frames {
            writer.write_sample(mix_l[i]).map_err(|e| format!("write_sample L: {e}"))?;
            writer.write_sample(mix_r[i]).map_err(|e| format!("write_sample R: {e}"))?;
            if i % report_every == 0 {
                progress_cb(0.78 + 0.20 * i as f32 / frames as f32);
            }
        }
    } else {
        // 16-bit entier
        let scale = i16::MAX as f32;
        for i in 0..frames {
            let l = (mix_l[i].clamp(-1.0, 1.0) * scale) as i16;
            let r = (mix_r[i].clamp(-1.0, 1.0) * scale) as i16;
            writer.write_sample(l).map_err(|e| format!("write_sample L16: {e}"))?;
            writer.write_sample(r).map_err(|e| format!("write_sample R16: {e}"))?;
            if i % report_every == 0 {
                progress_cb(0.78 + 0.20 * i as f32 / frames as f32);
            }
        }
    }

    writer.finalize().map_err(|e| format!("finalize: {e}"))
}

// ─── Import audio (symphonia) ─────────────────────────────────────────────────

/// Décode un fichier audio multi-format (WAV, MP3, OGG, FLAC) vers f32 48kHz stéréo.
/// Retourne (frames_interleaved_stereo, nb_frames).
/// Nécessite la feature symphonia.
pub fn decode_audio_file(path: &str) -> Result<(Vec<f32>, u32, u16), String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let file = std::fs::File::open(path)
        .map_err(|e| format!("Ouverture fichier: {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    // Deviner l'extension.
    if let Some(ext) = std::path::Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| format!("Probe format: {e}"))?;

    let mut format = probed.format;

    // Prendre le premier track audio.
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("Aucun track audio trouvé")?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();

    let dec_opts: DecoderOptions = Default::default();
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &dec_opts)
        .map_err(|e| format!("Décodeur: {e}"))?;

    let src_sample_rate = codec_params.sample_rate.unwrap_or(44_100);
    let src_channels = codec_params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(2);

    let mut all_frames: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(_)) => break,
            Err(symphonia::core::errors::Error::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(e) => return Err(format!("Lecture paquet: {e}")),
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let mut sample_buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                sample_buf.copy_interleaved_ref(decoded);
                all_frames.extend_from_slice(sample_buf.samples());
            }
            Err(symphonia::core::errors::Error::IoError(_)) => break,
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(format!("Décodage: {e}")),
        }
    }

    Ok((all_frames, src_sample_rate, src_channels))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::project::{ProjectClip, ProjectTrack};

    fn make_project_with_clip(pos: f64, dur: f64) -> MspProject {
        MspProject {
            version: "1.0".to_string(),
            name: "test".to_string(),
            profile_id: "p".to_string(),
            level_created_at: 1,
            bpm: 120.0,
            tracks: vec![ProjectTrack {
                id: "1".to_string(),
                name: "Piste 1".to_string(),
                color: "#ff0000".to_string(),
                volume: 1.0,
                pan: 0.0,
                muted: false,
                solo: false,
                clips: vec![ProjectClip {
                    id: "c1".to_string(),
                    sample_id: 0,
                    position: pos,
                    duration: dur,
                    color: "#fff".to_string(),
                }],
                track_type: Some("audio".to_string()),
            }],
            pads: vec![],
            drum_pattern: None,
            instrument_tracks: None,
        }
    }

    #[test]
    fn test_duration_calculation() {
        let project = make_project_with_clip(2.0, 3.0); // fin à 5.0 + 0.5 tail
        let frames = calculate_duration_frames(&project, 48_000);
        assert_eq!(frames, (5.5 * 48_000.0) as usize);
    }

    #[test]
    fn test_empty_project_zero() {
        let project = MspProject {
            version: "1.0".to_string(),
            name: "empty".to_string(),
            profile_id: "p".to_string(),
            level_created_at: 1,
            bpm: 120.0,
            tracks: vec![],
            pads: vec![],
            drum_pattern: None,
            instrument_tracks: None,
        };
        let frames = calculate_duration_frames(&project, 48_000);
        assert_eq!(frames, (0.5 * 48_000.0) as usize);
    }
}
