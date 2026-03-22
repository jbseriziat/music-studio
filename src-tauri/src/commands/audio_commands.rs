use std::sync::Mutex;
use tauri::State;

use crate::audio::{AudioCommand, AudioEngine};

#[tauri::command]
pub fn play(engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(AudioCommand::Play);
    Ok(())
}

#[tauri::command]
pub fn pause(engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(AudioCommand::Pause);
    Ok(())
}

#[tauri::command]
pub fn stop(engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(AudioCommand::Stop);
    Ok(())
}

#[tauri::command]
pub fn set_master_volume(volume: f32, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    if !(0.0..=1.0).contains(&volume) {
        return Err(format!("Volume invalide : {volume} (attendu 0.0–1.0)"));
    }
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(AudioCommand::SetMasterVolume(volume));
    Ok(())
}

#[tauri::command]
pub fn ping_audio(engine: State<Mutex<AudioEngine>>) -> String {
    let engine = engine.inner().lock().unwrap();
    if engine.is_active() {
        format!(
            "Audio OK — périphérique : {} ({} Hz, {} canaux)",
            engine.device_name, engine.config.sample_rate, engine.config.channels
        )
    } else {
        "Audio désactivé (aucun périphérique détecté)".to_string()
    }
}

/// Ajoute un clip sur la timeline audio.
#[tauri::command]
pub fn add_clip(
    clip_id: u32,
    sample_id: u32,
    position_secs: f64,
    duration_secs: f64,
    engine: State<Mutex<AudioEngine>>,
    sample_bank: State<Mutex<crate::sampler::SampleBank>>,
) -> Result<(), String> {
    let bank = sample_bank.inner().lock().map_err(|e| e.to_string())?;
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    let sr = eng.config.sample_rate as f64;

    // S'assurer que le sample est chargé dans le thread audio.
    if let Some((data, channels, sample_sr)) = bank.audio_data.get(sample_id as usize) {
        eng.send_command(AudioCommand::LoadSample {
            id: sample_id,
            data: std::sync::Arc::clone(data),
            channels: *channels,
            sample_rate: *sample_sr,
        });
    }

    eng.send_command(AudioCommand::AddClip {
        id: clip_id,
        sample_id,
        position_frames: (position_secs * sr) as u64,
        duration_frames: (duration_secs * sr) as u64,
    });
    Ok(())
}

/// Déplace un clip à une nouvelle position (en secondes).
#[tauri::command]
pub fn move_clip(
    clip_id: u32,
    new_position_secs: f64,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    let sr = eng.config.sample_rate as f64;
    eng.send_command(AudioCommand::MoveClip {
        id: clip_id,
        new_position_frames: (new_position_secs * sr) as u64,
    });
    Ok(())
}

/// Supprime un clip de la timeline audio.
#[tauri::command]
pub fn delete_clip(clip_id: u32, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(AudioCommand::DeleteClip { id: clip_id });
    Ok(())
}

/// Repositionne la lecture à une position donnée (en secondes).
#[tauri::command]
pub fn set_position(
    position_secs: f64,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    let sr = eng.config.sample_rate as f64;
    eng.send_command(AudioCommand::SetPosition {
        frames: (position_secs * sr) as u64,
    });
    Ok(())
}
