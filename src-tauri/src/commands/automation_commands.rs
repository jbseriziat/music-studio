use std::sync::atomic::Ordering;
use std::sync::Mutex;

use tauri::State;

use crate::audio::automation::AutomationParam;
use crate::audio::{AudioCommand, AudioEngine};

/// Point d'automation sérialisable (retourné par `get_automation_lane`).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AutomationPointData {
    pub id: u32,
    pub time_beats: f64,
    pub value: f32,
}

/// Reconstruit la lane triée et l'envoie au callback audio.
fn rebuild_and_send(track_id: u32, parameter: &str, eng: &mut AudioEngine) {
    let Some(param) = AutomationParam::from_str(parameter) else {
        return;
    };
    let key = (track_id, parameter.to_string());
    let points: Vec<(f64, f32)> = eng
        .automation_shadow
        .get(&key)
        .map(|pts| {
            let mut v: Vec<(f64, f32)> = pts.iter().map(|(_, b, val)| (*b, *val)).collect();
            v.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
            v
        })
        .unwrap_or_default();

    eng.send_command(AudioCommand::SetAutomationPoints {
        track_id,
        param,
        points,
    });
}

/// Ajoute un point d'automation sur la piste `track_id` pour le paramètre `parameter`.
/// Retourne l'ID du nouveau point.
#[tauri::command]
pub fn add_automation_point(
    track_id: u32,
    parameter: String,
    time_beats: f64,
    value: f32,
    engine: State<'_, Mutex<AudioEngine>>,
) -> Result<u32, String> {
    let mut eng = engine.lock().map_err(|e| e.to_string())?;

    // Valider le paramètre.
    AutomationParam::from_str(&parameter)
        .ok_or_else(|| format!("Paramètre inconnu : {parameter}"))?;

    let point_id = eng
        .next_auto_point_id
        .fetch_add(1, Ordering::Relaxed);

    let key = (track_id, parameter.clone());
    eng.automation_shadow
        .entry(key)
        .or_default()
        .push((point_id, time_beats, value.clamp(0.0, 1.0)));

    rebuild_and_send(track_id, &parameter, &mut eng);

    Ok(point_id)
}

/// Met à jour la position et la valeur d'un point existant.
#[tauri::command]
pub fn update_automation_point(
    track_id: u32,
    parameter: String,
    point_id: u32,
    time_beats: f64,
    value: f32,
    engine: State<'_, Mutex<AudioEngine>>,
) -> Result<(), String> {
    let mut eng = engine.lock().map_err(|e| e.to_string())?;

    let key = (track_id, parameter.clone());
    if let Some(pts) = eng.automation_shadow.get_mut(&key) {
        if let Some(pt) = pts.iter_mut().find(|(id, _, _)| *id == point_id) {
            pt.1 = time_beats;
            pt.2 = value.clamp(0.0, 1.0);
        }
    }

    rebuild_and_send(track_id, &parameter, &mut eng);
    Ok(())
}

/// Supprime un point d'automation.
#[tauri::command]
pub fn delete_automation_point(
    track_id: u32,
    parameter: String,
    point_id: u32,
    engine: State<'_, Mutex<AudioEngine>>,
) -> Result<(), String> {
    let mut eng = engine.lock().map_err(|e| e.to_string())?;

    let key = (track_id, parameter.clone());
    if let Some(pts) = eng.automation_shadow.get_mut(&key) {
        pts.retain(|(id, _, _)| *id != point_id);
    }

    rebuild_and_send(track_id, &parameter, &mut eng);
    Ok(())
}

/// Retourne tous les points d'une lane d'automation, triés par `time_beats`.
#[tauri::command]
pub fn get_automation_lane(
    track_id: u32,
    parameter: String,
    engine: State<'_, Mutex<AudioEngine>>,
) -> Result<Vec<AutomationPointData>, String> {
    let eng = engine.lock().map_err(|e| e.to_string())?;

    let key = (track_id, parameter);
    let mut pts: Vec<AutomationPointData> = eng
        .automation_shadow
        .get(&key)
        .map(|v| {
            v.iter()
                .map(|(id, tb, val)| AutomationPointData {
                    id: *id,
                    time_beats: *tb,
                    value: *val,
                })
                .collect()
        })
        .unwrap_or_default();

    pts.sort_by(|a, b| {
        a.time_beats
            .partial_cmp(&b.time_beats)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(pts)
}

/// Supprime toutes les lanes d'automation d'une piste (utilisé au chargement de projet).
#[tauri::command]
pub fn clear_track_automation(
    track_id: u32,
    engine: State<'_, Mutex<AudioEngine>>,
) -> Result<(), String> {
    let mut eng = engine.lock().map_err(|e| e.to_string())?;

    // Supprimer toutes les lanes pour cette piste.
    eng.automation_shadow
        .retain(|(tid, _), _| *tid != track_id);

    // Envoyer des lanes vides au callback.
    for param_str in ["volume", "pan"] {
        if let Some(param) = AutomationParam::from_str(param_str) {
            eng.send_command(AudioCommand::SetAutomationPoints {
                track_id,
                param,
                points: Vec::new(),
            });
        }
    }

    Ok(())
}
