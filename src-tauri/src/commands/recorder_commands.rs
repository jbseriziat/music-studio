use std::sync::Mutex;
use tauri::State;

use crate::audio::recorder::{InputDeviceInfo, Recorder};
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
