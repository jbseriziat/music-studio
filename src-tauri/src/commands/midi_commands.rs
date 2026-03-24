use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::audio::AudioEngine;
use crate::midi::MidiEngine;

/// DTO pour un périphérique MIDI d'entrée.
#[derive(Debug, Serialize)]
pub struct MidiDeviceDto {
    pub name: String,
    pub is_connected: bool,
}

/// Retourne la liste des périphériques MIDI d'entrée disponibles.
#[tauri::command]
pub fn list_midi_devices(
    midi_engine: State<Mutex<MidiEngine>>,
) -> Result<Vec<MidiDeviceDto>, String> {
    let engine = midi_engine.lock().map_err(|e| e.to_string())?;
    let names = engine.list_devices()?;
    let connected = engine.is_connected();
    // Note : on ne trackque pas quel device précis est connecté dans ce DTO.
    // Pour simplifier, on marque is_connected = true sur tous si connecté.
    Ok(names
        .into_iter()
        .map(|n| MidiDeviceDto {
            name: n,
            is_connected: connected,
        })
        .collect())
}

/// Connecte un périphérique MIDI d'entrée par son nom.
/// Les événements MIDI reçus sont routés vers la piste synthé active.
#[tauri::command]
pub fn connect_midi_device(
    device_name: String,
    midi_engine: State<Mutex<MidiEngine>>,
    audio_engine: State<Mutex<AudioEngine>>,
) -> Result<(), String> {
    // Récupérer le command_sender depuis le moteur audio dans un bloc pour libérer le lock.
    let sender = {
        let audio = audio_engine.lock().map_err(|e| e.to_string())?;
        audio
            .get_command_sender()
            .ok_or_else(|| "Moteur audio inactif".to_string())?
    };

    let mut midi = midi_engine.lock().map_err(|e| e.to_string())?;
    midi.connect(&device_name, sender)
}

/// Déconnecte le périphérique MIDI actif.
#[tauri::command]
pub fn disconnect_midi_device(
    midi_engine: State<Mutex<MidiEngine>>,
) -> Result<(), String> {
    let mut midi = midi_engine.lock().map_err(|e| e.to_string())?;
    midi.disconnect();
    Ok(())
}

/// Définit la piste synthé active pour le routage des événements MIDI.
/// Appelé quand l'utilisateur sélectionne une piste instrument.
#[tauri::command]
pub fn set_midi_active_track(
    track_id: u32,
    midi_engine: State<Mutex<MidiEngine>>,
) -> Result<(), String> {
    let midi = midi_engine.lock().map_err(|e| e.to_string())?;
    midi.set_active_track(track_id);
    Ok(())
}
