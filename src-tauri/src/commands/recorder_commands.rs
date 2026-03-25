use std::sync::Mutex;
use tauri::State;

use crate::audio::commands::{AudioCommand, SynthProducer};
use crate::audio::recorder::{InputDeviceInfo, Recorder};
use crate::audio::synth_recorder::SynthRecorder;
use crate::audio::AudioEngine;
use crate::project::file_io;

/// Retourne la liste des périphériques d'entrée audio.
#[tauri::command]
pub fn list_input_devices() -> Result<Vec<InputDeviceInfo>, String> {
    Recorder::list_input_devices()
}

/// Sélectionne le périphérique d'entrée audio (None = par défaut).
#[tauri::command]
pub fn set_input_device(
    device_name: Option<String>,
    recorder: State<Mutex<Recorder>>,
) -> Result<(), String> {
    let mut rec = recorder.inner().lock().map_err(|e| e.to_string())?;
    rec.selected_device_name = device_name;
    Ok(())
}

/// Arme ou désarme une piste pour l'enregistrement.
#[tauri::command]
pub fn arm_track(
    track_id: u32,
    armed: bool,
    recorder: State<Mutex<Recorder>>,
) -> Result<(), String> {
    let mut rec = recorder.inner().lock().map_err(|e| e.to_string())?;
    rec.armed_track_id = if armed { Some(track_id) } else { None };
    Ok(())
}

/// Active ou désactive l'écoute du micro en temps réel (monitoring).
/// NOTE : le monitoring complet (mix micro + sortie) n'est pas encore implémenté.
#[tauri::command]
pub fn set_monitoring(
    enabled: bool,
    recorder: State<Mutex<Recorder>>,
) -> Result<(), String> {
    let mut rec = recorder.inner().lock().map_err(|e| e.to_string())?;
    rec.monitoring_enabled = enabled;
    Ok(())
}

/// Démarre l'enregistrement (nécessite qu'une piste soit armée).
/// Appeler avant `play()` ou simultanément.
#[tauri::command]
pub fn start_recording(recorder: State<Mutex<Recorder>>) -> Result<(), String> {
    let mut rec = recorder.inner().lock().map_err(|e| e.to_string())?;
    rec.start()
}

/// Arrête l'enregistrement et sauvegarde le WAV.
/// Retourne le chemin absolu du fichier WAV créé.
/// `project_name` est utilisé pour déterminer le dossier de destination.
#[tauri::command]
pub fn stop_recording(
    project_name: String,
    recorder: State<Mutex<Recorder>>,
) -> Result<String, String> {
    // Déterminer le dossier du projet.
    let projects_dir = file_io::get_projects_dir()?;
    let project_dir = projects_dir.join(&project_name);

    let mut rec = recorder.inner().lock().map_err(|e| e.to_string())?;
    rec.stop(&project_dir.to_string_lossy())
}

/// Retourne l'ID de la piste armée (None si aucune piste n'est armée).
#[tauri::command]
pub fn get_armed_track(recorder: State<Mutex<Recorder>>) -> Option<u32> {
    recorder
        .inner()
        .lock()
        .ok()
        .and_then(|r| r.armed_track_id)
}

/// Retourne true si un enregistrement est en cours.
#[tauri::command]
pub fn is_recording_active(recorder: State<Mutex<Recorder>>) -> bool {
    recorder
        .inner()
        .lock()
        .ok()
        .map(|r| r.is_recording)
        .unwrap_or(false)
}

// ─── Enregistrement du synthé (capture interne, sans micro) ──────────────────

/// Démarre la capture de la sortie du synthé de la piste `track_id`.
///
/// Crée un ring buffer lock-free et envoie le producteur au callback audio.
/// Le consommateur est pris en charge par un thread d'écriture interne.
#[tauri::command]
pub fn start_synth_recording(
    track_id: u32,
    engine: State<Mutex<AudioEngine>>,
    synth_rec: State<Mutex<Option<SynthRecorder>>>,
) -> Result<(), String> {
    // Créer un ring buffer stéréo pour ~2 s à 48 kHz (192 000 f32 ≈ 768 KB).
    let rb = ringbuf::HeapRb::<f32>::new(48_000 * 4);
    let (producer, consumer) = ringbuf::traits::Split::split(rb);

    // Démarrer le thread d'écriture.
    let recorder = SynthRecorder::new(consumer);
    *synth_rec.inner().lock().map_err(|e| e.to_string())? = Some(recorder);

    // Envoyer le producteur au callback audio via le canal lock-free.
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::SetSynthRecordProducer {
            track_id,
            producer: SynthProducer(producer),
        });

    Ok(())
}

/// Arrête la capture du synthé et sauvegarde le WAV dans le dossier du projet.
///
/// Retourne le chemin absolu du fichier WAV créé.
#[tauri::command]
pub fn stop_synth_recording(
    project_name: String,
    engine: State<Mutex<AudioEngine>>,
    synth_rec: State<Mutex<Option<SynthRecorder>>>,
) -> Result<String, String> {
    // 1. Demander au callback d'arrêter la capture (drop du HeapProd).
    engine
        .inner()
        .lock()
        .map_err(|e| e.to_string())?
        .send_command(AudioCommand::ClearSynthRecord);

    // 2. Laisser le callback traiter la commande (≈ 10 ms par cycle à 512 frames/48kHz).
    std::thread::sleep(std::time::Duration::from_millis(30));

    // 3. Arrêter le thread d'écriture et sauvegarder.
    let mut state = synth_rec.inner().lock().map_err(|e| e.to_string())?;
    let mut recorder = state
        .take()
        .ok_or_else(|| "Aucun enregistrement synthé en cours".to_string())?;

    // Construire le chemin de sortie (même répertoire que les enregistrements micro).
    let projects_dir = file_io::get_projects_dir()?;
    let recordings_dir = projects_dir.join(&project_name).join("recordings");
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let path = recordings_dir.join(format!("synth_{}.wav", ts));
    let path_str = path.to_string_lossy().to_string();

    recorder.stop_and_save(&path_str)?;
    Ok(path_str)
}
