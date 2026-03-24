use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc, Mutex,
};

use ringbuf::traits::Producer;

use crate::audio::commands::AudioCommand;

/// Valeur sentinelle : aucune piste synthé active.
const NO_TRACK: u32 = u32::MAX;

/// Alias pour le type du canal de commandes audio (partagé avec MidiEngine).
type CommandSender = Arc<Mutex<ringbuf::HeapProd<AudioCommand>>>;

/// Moteur MIDI — gère la connexion aux périphériques d'entrée MIDI via midir.
///
/// Les événements reçus (NoteOn / NoteOff) sont routés vers la piste synthé
/// active via le canal lock-free du moteur audio.
pub struct MidiEngine {
    /// Connexion MIDI active (None si déconnecté).
    connection: Option<midir::MidiInputConnection<()>>,
    /// Track ID Rust de la piste synthé active pour le routage MIDI.
    /// NO_TRACK = aucun routage.
    pub active_track_id: Arc<AtomicU32>,
}

impl MidiEngine {
    pub fn new() -> Self {
        Self {
            connection: None,
            active_track_id: Arc::new(AtomicU32::new(NO_TRACK)),
        }
    }

    /// Liste les noms de tous les périphériques MIDI d'entrée disponibles.
    pub fn list_devices(&self) -> Result<Vec<String>, String> {
        let midi_in = midir::MidiInput::new("music-studio-list")
            .map_err(|e| e.to_string())?;
        let ports = midi_in.ports();
        let names: Vec<String> = ports
            .iter()
            .filter_map(|p| midi_in.port_name(p).ok())
            .collect();
        Ok(names)
    }

    /// Connecte un périphérique MIDI d'entrée par son nom.
    ///
    /// Les messages MIDI reçus sont routés vers la piste active via `command_sender`.
    pub fn connect(
        &mut self,
        device_name: &str,
        command_sender: CommandSender,
    ) -> Result<(), String> {
        // Déconnecter le périphérique précédent si nécessaire.
        self.disconnect();

        let midi_in = midir::MidiInput::new("music-studio-midi")
            .map_err(|e| e.to_string())?;
        let ports = midi_in.ports();

        // Trouver le port par nom.
        let port = ports
            .iter()
            .find(|p| midi_in.port_name(p).ok().as_deref() == Some(device_name))
            .ok_or_else(|| format!("Périphérique MIDI introuvable : {device_name}"))?
            .clone();

        // Cloner les Arcs pour les capturer dans le callback MIDI.
        let sender = command_sender;
        let track_arc = Arc::clone(&self.active_track_id);

        let connection = midi_in
            .connect(
                &port,
                "music-studio-midi-in",
                move |_ts, message, _| {
                    // Messages MIDI : au moins status + data1
                    if message.len() < 2 {
                        return;
                    }

                    let tid = track_arc.load(Ordering::Relaxed);
                    if tid == NO_TRACK {
                        return;
                    }

                    let status = message[0] & 0xF0;
                    let note = message[1];
                    let velocity = message.get(2).copied().unwrap_or(0);

                    let cmd = match status {
                        // Note On (vélocité > 0)
                        0x90 if velocity > 0 => {
                            AudioCommand::NoteOn { track_id: tid, note, velocity }
                        }
                        // Note Off ou Note On avec vélocité 0
                        0x80 | 0x90 => {
                            AudioCommand::NoteOff { track_id: tid, note }
                        }
                        // Ignorer les autres messages (CC, Program Change, etc.)
                        _ => return,
                    };

                    if let Ok(mut prod) = sender.lock() {
                        // Si le canal est plein, on ignore silencieusement.
                        let _ = prod.try_push(cmd);
                    }
                },
                (),
            )
            .map_err(|e| e.to_string())?;

        self.connection = Some(connection);
        Ok(())
    }

    /// Déconnecte le périphérique MIDI actif.
    pub fn disconnect(&mut self) {
        if let Some(conn) = self.connection.take() {
            // close() retourne (MidiInput, ()), les deux sont dropés ici.
            let _ = conn.close();
        }
    }

    /// Indique si un périphérique est actuellement connecté.
    pub fn is_connected(&self) -> bool {
        self.connection.is_some()
    }

    /// Définit la piste synthé active pour le routage des événements MIDI entrants.
    pub fn set_active_track(&self, track_id: u32) {
        self.active_track_id.store(track_id, Ordering::Relaxed);
    }
}

impl Default for MidiEngine {
    fn default() -> Self {
        Self::new()
    }
}
