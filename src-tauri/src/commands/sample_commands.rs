use crate::audio::commands::AudioCommand;
use crate::audio::AudioEngine;
use crate::sampler::sample_bank::{compute_waveform, load_wav};
use crate::sampler::SampleInfo;
use std::path::Path;
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

/// Charge un fichier WAV arbitraire, l'ajoute à la banque et le notifie au thread audio.
/// Utilisé pour importer des sons personnels (niveau 3+) ou pour des tests.
/// Retourne un SampleInfo avec l'identifiant attribué et la waveform précalculée.
#[tauri::command]
pub fn load_sample(
    path: String,
    engine: State<Mutex<AudioEngine>>,
    sample_bank: State<Mutex<crate::sampler::SampleBank>>,
) -> Result<SampleInfo, String> {
    let file_path = Path::new(&path);

    // 1. Charger et traiter le fichier audio (hors verrou)
    let (frames, channels, sample_rate) = load_wav(file_path)?;
    let num_frames = frames.len() / channels as usize;
    let duration_ms = ((num_frames as f64 / sample_rate as f64) * 1000.0) as u32;
    let waveform = compute_waveform(&frames, channels, 128);
    let name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("sample")
        .to_string();
    let data = std::sync::Arc::new(frames);

    // 2. Ajouter à la banque (verrou banque relâché avant d'accéder au moteur)
    let (info, data_for_engine) = {
        let mut bank = sample_bank.inner().lock().map_err(|e| e.to_string())?;

        // L'ID = prochain index dans audio_data (IDs contigus depuis le chargement initial)
        let new_id = bank.audio_data.len() as u32;
        bank.audio_data.push((std::sync::Arc::clone(&data), channels, sample_rate));

        let info = SampleInfo {
            id: new_id,
            name,
            category: "imported".to_string(),
            path,
            duration_ms,
            waveform,
            tags: vec!["imported".to_string()],
        };
        bank.samples.push(info.clone());
        (info, std::sync::Arc::clone(&data))
    }; // verrou banque relâché ici

    // 3. Notifier le thread audio pour qu'il puisse lire ce sample
    {
        let eng = engine.inner().lock().map_err(|e| e.to_string())?;
        eng.send_command(AudioCommand::LoadSample {
            id: info.id,
            data: data_for_engine,
            channels,
            sample_rate,
        });
    }

    Ok(info)
}
