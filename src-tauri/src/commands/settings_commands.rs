use serde::{Deserialize, Serialize};

/// Représentation d'un périphérique audio (envoyée au frontend).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub name: String,
}

/// Retourne la liste des périphériques audio disponibles.
/// (Implémentation déléguée à audio_commands::get_audio_devices pour éviter la duplication.)
#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let devices = host
        .output_devices()
        .map_err(|e| e.to_string())?
        .filter_map(|d| {
            let name = d.name().ok()?;
            Some(AudioDevice { name })
        })
        .collect();
    Ok(devices)
}

/// Charge les profils utilisateurs depuis le disque (Phase 1 — placeholder).
/// Les profils sont actuellement gérés côté frontend via Zustand + localStorage.
#[tauri::command]
pub fn get_profiles() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!([]))
}

/// Sauvegarde les profils utilisateurs sur le disque (Phase 1 — placeholder).
#[tauri::command]
pub fn save_profiles(_profiles: serde_json::Value) -> Result<(), String> {
    // Phase 0 : la persistance est assurée par Zustand localStorage côté frontend.
    Ok(())
}
