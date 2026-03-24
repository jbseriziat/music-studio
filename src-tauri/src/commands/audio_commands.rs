use std::collections::HashMap;
use std::sync::{atomic::{AtomicU32, Ordering}, Arc, Mutex};
use tauri::State;

use crate::audio::{AudioCommand, AudioEngine, EffectShadowEntry};
use crate::effects::{
    compressor::Compressor, delay::Delay, eq::Eq, reverb::Reverb, BoxedEffect, Effect,
};

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

/// Ajoute un effet (reverb ou delay) à la chaîne d'une piste.
/// Retourne l'ID de l'effet créé.
#[tauri::command]
pub fn add_effect(
    track_id: u32,
    effect_type: String,
    engine: State<Mutex<AudioEngine>>,
) -> Result<u32, String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    let effect_id = eng.next_effect_id.fetch_add(1, Ordering::Relaxed);
    let sample_rate = eng.config.sample_rate;

    let (boxed, params, gr_arc): (BoxedEffect, Vec<(String, f32)>, Option<Arc<AtomicU32>>) =
        match effect_type.as_str() {
        "reverb" => {
            let rev = Reverb::new();
            let params = rev.get_all_params();
            (BoxedEffect(Box::new(rev)), params, None)
        }
        "delay" => {
            let del = Delay::new(sample_rate);
            let params = del.get_all_params();
            (BoxedEffect(Box::new(del)), params, None)
        }
        "eq" => {
            let e = Eq::new(sample_rate);
            let params = e.get_all_params();
            (BoxedEffect(Box::new(e)), params, None)
        }
        "compressor" => {
            let arc = Arc::new(AtomicU32::new(0));
            let comp = Compressor::new(sample_rate, Arc::clone(&arc));
            let params = comp.get_all_params();
            (BoxedEffect(Box::new(comp)), params, Some(arc))
        }
        other => return Err(format!("Type d'effet inconnu : {other}")),
    };

    // Stocker l'arc de gain reduction pour les compresseurs.
    if let Some(arc) = gr_arc {
        if let Ok(mut map) = eng.gain_reductions.lock() {
            map.insert((track_id, effect_id), arc);
        }
    }

    // Mettre à jour le shadow state (lecture thread principal).
    let mut shadow = eng.effects_shadow.lock().map_err(|e| e.to_string())?;
    let mut params_map = HashMap::new();
    for (k, v) in params {
        params_map.insert(k, v);
    }
    shadow.insert(
        (track_id, effect_id),
        EffectShadowEntry { effect_type, params: params_map, bypass: false },
    );
    drop(shadow);

    eng.send_command(AudioCommand::AddEffect { track_id, effect_id, effect: boxed });
    Ok(effect_id)
}

/// Supprime un effet de la chaîne d'une piste.
#[tauri::command]
pub fn remove_effect(
    track_id: u32,
    effect_id: u32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    let mut shadow = eng.effects_shadow.lock().map_err(|e| e.to_string())?;
    shadow.remove(&(track_id, effect_id));
    drop(shadow);
    if let Ok(mut gr) = eng.gain_reductions.lock() {
        gr.remove(&(track_id, effect_id));
    }
    eng.send_command(AudioCommand::RemoveEffect { track_id, effect_id });
    Ok(())
}

/// Définit un paramètre d'un effet.
#[tauri::command]
pub fn set_effect_param(
    track_id: u32,
    effect_id: u32,
    param_name: String,
    value: f32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    // Mettre à jour le shadow state.
    if let Ok(mut shadow) = eng.effects_shadow.lock() {
        if let Some(entry) = shadow.get_mut(&(track_id, effect_id)) {
            entry.params.insert(param_name.clone(), value);
        }
    }
    eng.send_command(AudioCommand::SetEffectParam {
        track_id,
        effect_id,
        param: param_name,
        value,
    });
    Ok(())
}

/// Active/désactive le bypass d'un effet.
#[tauri::command]
pub fn set_effect_bypass(
    track_id: u32,
    effect_id: u32,
    bypass: bool,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    if let Ok(mut shadow) = eng.effects_shadow.lock() {
        if let Some(entry) = shadow.get_mut(&(track_id, effect_id)) {
            entry.bypass = bypass;
        }
    }
    eng.send_command(AudioCommand::SetEffectBypass { track_id, effect_id, bypass });
    Ok(())
}

/// Retourne tous les paramètres d'un effet (lecture depuis le shadow state).
#[tauri::command]
pub fn get_effect_params(
    track_id: u32,
    effect_id: u32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<HashMap<String, f32>, String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    let shadow = eng.effects_shadow.lock().map_err(|e| e.to_string())?;
    match shadow.get(&(track_id, effect_id)) {
        Some(entry) => Ok(entry.params.clone()),
        None => Err(format!("Effet {effect_id} introuvable sur la piste {track_id}")),
    }
}

/// Retourne la réduction de gain courante d'un compresseur (en dB, ≥ 0).
/// Lecture lock-free depuis l'arc partagé avec le thread audio.
#[tauri::command]
pub fn get_compressor_gain_reduction(
    track_id: u32,
    effect_id: u32,
    engine: State<Mutex<AudioEngine>>,
) -> Result<f32, String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    let map = eng.gain_reductions.lock().map_err(|e| e.to_string())?;
    match map.get(&(track_id, effect_id)) {
        Some(arc) => Ok(f32::from_bits(arc.load(Ordering::Relaxed))),
        None => Ok(0.0),
    }
}
