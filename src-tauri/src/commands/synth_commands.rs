use crate::audio::{
    commands::{AudioCommand, SynthParam},
    engine::AudioEngine,
};
use crate::synth::{get_builtin_presets, SynthPreset};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::State;

/// Compteur monotone pour les IDs de pistes synthé (commence à 100 pour éviter les conflits).
static NEXT_SYNTH_TRACK_ID: AtomicU32 = AtomicU32::new(100);

/// Compteur monotone pour les IDs de clips MIDI.
static NEXT_CLIP_ID: AtomicU32 = AtomicU32::new(1);

/// Informations sur un preset retournées au frontend.
#[derive(Debug, Clone, Serialize)]
pub struct PresetInfo {
    pub name: String,
    pub waveform: String,
    pub attack: f32,
    pub decay: f32,
    pub sustain: f32,
    pub release: f32,
    pub cutoff: f32,
    pub resonance: f32,
}

impl From<&SynthPreset> for PresetInfo {
    fn from(p: &SynthPreset) -> Self {
        Self {
            name: p.name.clone(),
            waveform: format!("{:?}", p.waveform),
            attack: p.attack,
            decay: p.decay,
            sustain: p.sustain,
            release: p.release,
            cutoff: p.cutoff,
            resonance: p.resonance,
        }
    }
}

/// Crée une nouvelle piste synthétiseur et retourne son ID numérique.
/// Le frontend utilise cet ID pour les appels note_on / set_synth_param.
#[tauri::command]
pub fn create_synth_track(
    _name: String,
    engine: State<Mutex<AudioEngine>>,
) -> Result<u32, String> {
    let track_id = NEXT_SYNTH_TRACK_ID.fetch_add(1, Ordering::SeqCst);
    if track_id >= 100 + 4 {
        return Err("Maximum 4 pistes synthétiseur atteint".to_string());
    }
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::CreateSynthTrack { track_id });
    Ok(track_id)
}

/// Déclenche une note MIDI sur la piste instrument (note pressée).
#[tauri::command]
pub fn note_on(
    track_id: u32,
    note: u8,
    velocity: u8,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::NoteOn { track_id, note, velocity });
    Ok(())
}

/// Relâche une note MIDI sur la piste instrument (note relâchée).
#[tauri::command]
pub fn note_off(
    track_id: u32,
    note: u8,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::NoteOff { track_id, note });
    Ok(())
}

/// Met à jour un paramètre du synthé d'une piste.
///
/// `param` : "waveform" | "attack" | "decay" | "sustain" | "release" |
///           "cutoff" | "resonance" | "octave" | "detune" | "volume"
///
/// `value` : valeur numérique (waveform : 0=Sine, 1=Square, 2=Sawtooth, 3=Triangle)
#[tauri::command]
pub fn set_synth_param(
    track_id: u32,
    param: String,
    value: f32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let p = SynthParam::from_str(&param)
        .ok_or_else(|| format!("Paramètre inconnu : {param}"))?;
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::SetSynthParam { track_id, param: p, value });
    Ok(())
}

/// Charge un preset prédéfini par son nom sur la piste instrument.
#[tauri::command]
pub fn load_synth_preset(
    track_id: u32,
    preset_name: String,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let presets = get_builtin_presets();
    let preset = presets
        .into_iter()
        .find(|p| p.name == preset_name)
        .ok_or_else(|| format!("Preset inconnu : {preset_name}"))?;
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::LoadSynthPreset { track_id, preset });
    Ok(())
}

/// Retourne la liste des presets intégrés avec leurs paramètres.
#[tauri::command]
pub fn list_synth_presets() -> Result<Vec<PresetInfo>, String> {
    let infos = get_builtin_presets()
        .iter()
        .map(PresetInfo::from)
        .collect();
    Ok(infos)
}

// ── Piano Roll / MIDI clips ────────────────────────────────────────────────────

/// Note MIDI transmise depuis le piano roll (camelCase JS → snake_case Rust via Tauri).
#[derive(Debug, Deserialize)]
pub struct MidiNoteDto {
    pub id: u32,
    pub note: u8,
    pub start_beats: f64,
    pub duration_beats: f64,
    pub velocity: u8,
}

/// Crée un nouveau clip MIDI vide sur une piste instrument.
/// Retourne l'ID du clip créé.
#[tauri::command]
pub fn add_midi_clip(
    track_id: u32,
    start_beats: f64,
    length_beats: f64,
    engine: State<Mutex<AudioEngine>>,
) -> Result<u32, String> {
    let clip_id = NEXT_CLIP_ID.fetch_add(1, Ordering::SeqCst);
    let clip = crate::midi::MidiClip {
        id: clip_id,
        start_beats,
        length_beats,
        notes: Vec::new(),
    };
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::AddMidiClip { track_id, clip });
    Ok(clip_id)
}

/// Remplace toutes les notes d'un clip MIDI existant.
/// Appelé par le piano roll à chaque modification (ajout, déplacement, suppression de note).
#[tauri::command]
pub fn update_midi_clip_notes(
    track_id: u32,
    clip_id: u32,
    notes: Vec<MidiNoteDto>,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let midi_notes: Vec<crate::midi::MidiNote> = notes
        .into_iter()
        .map(|n| crate::midi::MidiNote {
            id: n.id,
            note: n.note,
            start_beats: n.start_beats,
            duration_beats: n.duration_beats,
            velocity: n.velocity,
        })
        .collect();
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::UpdateMidiClipNotes { track_id, clip_id, notes: midi_notes });
    Ok(())
}

/// Supprime un clip MIDI d'une piste instrument.
#[tauri::command]
pub fn delete_midi_clip(
    track_id: u32,
    clip_id: u32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::DeleteMidiClip { track_id, clip_id });
    Ok(())
}
