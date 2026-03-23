use std::sync::{
    atomic::Ordering,
    Mutex,
};
use tauri::State;

use crate::audio::{AudioCommand, AudioEngine};
use crate::drums::DrumPattern;

/// Définit le BPM (tempo). Plage : 20–300.
#[tauri::command]
pub fn set_bpm(bpm: f64, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    if !(20.0..=300.0).contains(&bpm) {
        return Err(format!("BPM invalide : {bpm} (attendu 20–300)"));
    }
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetBpm { bpm });
    Ok(())
}

/// Active ou désactive un step du drum rack pour un pad donné.
#[tauri::command]
pub fn set_drum_step(
    pad: u8,
    step: u8,
    active: bool,
    velocity: f32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetDrumStep { pad, step, active, velocity });
    Ok(())
}

/// Assigne un sample_id à un pad du drum rack.
#[tauri::command]
pub fn assign_drum_pad(
    pad: u8,
    sample_id: u32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::AssignDrumPad { pad, sample_id });
    Ok(())
}

/// Déclenche immédiatement un pad du drum rack (jeu live).
#[tauri::command]
pub fn trigger_drum_pad(pad: u8, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::TriggerDrumPad { pad });
    Ok(())
}

/// Active ou désactive le métronome.
#[tauri::command]
pub fn set_metronome(enabled: bool, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetMetronome { enabled });
    Ok(())
}

/// Retourne le step courant du séquenceur (0–31). Utilisé pour l'affichage du curseur.
#[tauri::command]
pub fn get_current_step(engine: State<Mutex<AudioEngine>>) -> Result<u8, String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    Ok(eng.current_step.load(Ordering::Relaxed))
}

/// Retourne le BPM actuel tel que connu par le moteur audio.
#[tauri::command]
pub fn get_bpm(engine: State<Mutex<AudioEngine>>) -> Result<f64, String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    Ok(f64::from_bits(eng.bpm_bits.load(Ordering::Relaxed)))
}

/// Définit le nombre de steps du pattern (8, 16, ou 32).
#[tauri::command]
pub fn set_drum_step_count(count: u8, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetDrumStepCount { count });
    Ok(())
}

/// Remplace tout le pattern du drum rack (chargement projet / preset).
#[tauri::command]
pub fn set_drum_pattern(
    pattern: DrumPattern,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetDrumPattern { pattern });
    Ok(())
}

/// Ajuste le volume d'un pad du drum rack (0.0 = silence, 1.0 = nominal, 2.0 = +6 dB).
#[tauri::command]
pub fn set_drum_pad_volume(
    pad: u8,
    volume: f32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetDrumPadVolume { pad, volume });
    Ok(())
}

/// Transpose un pad du drum rack en demi-tons (−12 à +12).
#[tauri::command]
pub fn set_drum_pad_pitch(
    pad: u8,
    pitch_semitones: f32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetDrumPadPitch { pad, pitch_semitones });
    Ok(())
}

/// Charge un kit prédéfini : met à jour les samples, volumes et pitchs des 8 pads.
/// Retourne les configs mises à jour (sampleId, volume, pitch, name) pour le frontend.
#[tauri::command]
pub fn load_drum_kit(
    kit_name: String,
    engine: State<Mutex<AudioEngine>>,
) -> Result<Vec<crate::drums::DrumPadConfig>, String> {
    let pads = crate::drums::kit_pads(&kit_name);
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    for (i, pad) in pads.iter().enumerate() {
        eng.send_command(AudioCommand::AssignDrumPad    { pad: i as u8, sample_id: pad.sample_id });
        eng.send_command(AudioCommand::SetDrumPadVolume { pad: i as u8, volume: pad.volume });
        eng.send_command(AudioCommand::SetDrumPadPitch  { pad: i as u8, pitch_semitones: pad.pitch_semitones });
    }
    Ok(pads)
}

/// Retourne la liste des kits de batterie intégrés.
#[tauri::command]
pub fn list_drum_kits() -> Result<Vec<crate::drums::DrumKitInfo>, String> {
    Ok(crate::drums::built_in_kits())
}
