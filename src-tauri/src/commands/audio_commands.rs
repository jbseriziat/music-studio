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
    track_id: u32,
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
        track_id,
    });
    Ok(())
}

/// Configure la zone de boucle de la timeline.
#[tauri::command]
pub fn set_loop(
    enabled: bool,
    start_secs: f64,
    end_secs: f64,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    let sr = eng.config.sample_rate as f64;
    eng.send_command(AudioCommand::SetLoop {
        enabled,
        start_frames: (start_secs * sr) as u64,
        end_frames: (end_secs * sr) as u64,
    });
    Ok(())
}

/// Active/désactive le mute d'une piste (track_id = index 0-based).
#[tauri::command]
pub fn set_track_mute(track_id: u32, muted: bool, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(
        AudioCommand::SetTrackMute { track_id, muted },
    );
    Ok(())
}

/// Active/désactive le solo d'une piste.
#[tauri::command]
pub fn set_track_solo(track_id: u32, solo: bool, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(
        AudioCommand::SetTrackSolo { track_id, solo },
    );
    Ok(())
}

/// Ajuste le volume du métronome (0.0–1.0).
#[tauri::command]
pub fn set_metronome_volume(volume: f32, engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    if !(0.0..=1.0).contains(&volume) {
        return Err(format!("Volume métronome invalide : {volume} (attendu 0.0–1.0)"));
    }
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(
        AudioCommand::SetMetronomeVolume { volume },
    );
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

/// Efface tous les clips de la timeline (nouveau projet / chargement).
#[tauri::command]
pub fn clear_timeline(engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    engine.inner().lock().map_err(|e| e.to_string())?.send_command(AudioCommand::ClearTimeline);
    Ok(())
}

/// Règle le volume d'une piste en dB (−∞ à +6 dB). Converti en linéaire avant envoi.
#[tauri::command]
pub fn set_track_volume_db(
    track_id: u32,
    volume_db: f32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let volume = if volume_db <= -60.0 {
        0.0f32
    } else {
        10.0f32.powf(volume_db / 20.0)
    };
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetTrackVolume { track_id, volume });
    Ok(())
}

/// Règle le panoramique d'une piste (−1.0 gauche, 0.0 centre, +1.0 droite).
#[tauri::command]
pub fn set_track_pan_cmd(
    track_id: u32,
    pan: f32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    if !(-1.0f32..=1.0f32).contains(&pan) {
        return Err(format!("Pan invalide : {pan} (attendu -1.0–1.0)"));
    }
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetTrackPan { track_id, pan });
    Ok(())
}

/// Enregistre l'identifiant numérique de la piste Drum Rack (pour le metering des VU-mètres).
#[tauri::command]
pub fn set_drum_rack_track_id(
    track_id: u32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetDrumRackTrackId { track_id });
    Ok(())
}
