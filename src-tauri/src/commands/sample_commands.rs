use crate::audio::commands::AudioCommand;
use crate::audio::AudioEngine;
use crate::sampler::SampleInfo;
use std::sync::Mutex;
use tauri::State;

/// Déclenche la lecture immédiate du sample associé au pad.
#[tauri::command]
pub fn trigger_pad(
    pad_id: u8,
    engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::TriggerPad { pad_id });
    Ok(())
}

/// Assigne un sample (par id) à un pad et le charge dans le thread audio.
#[tauri::command]
pub fn assign_pad_sample(
    pad_id: u8,
    sample_id: u32,
    engine: State<Mutex<AudioEngine>>,
    sample_bank: State<Mutex<crate::sampler::SampleBank>>,
) -> Result<(), String> {
    let bank = sample_bank.inner().lock().map_err(|e| e.to_string())?;
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;

    if let Some((data, channels, sr)) = bank.audio_data.get(sample_id as usize) {
        eng.send_command(AudioCommand::LoadSample {
            id: sample_id,
            data: std::sync::Arc::clone(data),
            channels: *channels,
            sample_rate: *sr,
        });
    }
    eng.send_command(AudioCommand::AssignPad {
        pad_id,
        sample_id: Some(sample_id),
    });
    Ok(())
}

/// Liste les samples disponibles, optionnellement filtrés par catégorie.
#[tauri::command]
pub fn list_samples(
    category: Option<String>,
    sample_bank: State<Mutex<crate::sampler::SampleBank>>,
) -> Result<Vec<SampleInfo>, String> {
    let bank = sample_bank.inner().lock().map_err(|e| e.to_string())?;
    let result: Vec<SampleInfo> = bank
        .samples
        .iter()
        .filter(|s| {
            category
                .as_ref()
                .map(|c| &s.category == c)
                .unwrap_or(true)
        })
        .cloned()
        .collect();
    Ok(result)
}

/// Prévisualise un sample (joue une fois sans l'ajouter au projet).
#[tauri::command]
pub fn preview_sample(
    sample_id: u32,
    engine: State<Mutex<AudioEngine>>,
    sample_bank: State<Mutex<crate::sampler::SampleBank>>,
) -> Result<(), String> {
    let bank = sample_bank.inner().lock().map_err(|e| e.to_string())?;
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;

    if let Some((data, channels, sr)) = bank.audio_data.get(sample_id as usize) {
        eng.send_command(AudioCommand::LoadSample {
            id: sample_id,
            data: std::sync::Arc::clone(data),
            channels: *channels,
            sample_rate: *sr,
        });
    }
    eng.send_command(AudioCommand::PreviewSample { id: sample_id });
    Ok(())
}

/// Arrête la prévisualisation en cours.
#[tauri::command]
pub fn stop_preview(engine: State<Mutex<AudioEngine>>) -> Result<(), String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    eng.send_command(AudioCommand::StopPreview);
    Ok(())
}

/// Retourne la position de lecture courante en secondes.
#[tauri::command]
pub fn get_position(engine: State<Mutex<AudioEngine>>) -> Result<f64, String> {
    let eng = engine.inner().lock().map_err(|e| e.to_string())?;
    Ok(eng.position_secs())
}

/// Retourne la configuration actuelle des 16 pads (sample_id ou null).
#[tauri::command]
pub fn get_pad_config(
    sample_bank: State<Mutex<crate::sampler::SampleBank>>,
) -> Result<Vec<Option<u32>>, String> {
    // Au démarrage, les pads 0-15 sont pré-assignés aux 16 premiers samples.
    let bank = sample_bank.inner().lock().map_err(|e| e.to_string())?;
    let config: Vec<Option<u32>> = (0..16)
        .map(|i| bank.samples.get(i).map(|s| s.id))
        .collect();
    Ok(config)
}
