use serde::{Deserialize, Serialize};

/// Note MIDI dans un clip (position en beats relatif au début du clip).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiNote {
    pub id: u32,
    /// Numéro de note MIDI (0–127, 60 = C4).
    pub note: u8,
    /// Position de début en beats (relatif au clip).
    pub start_beats: f64,
    /// Durée en beats.
    pub duration_beats: f64,
    /// Vélocité (0–127).
    pub velocity: u8,
}

/// Clip MIDI sur la timeline d'une piste instrument.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiClip {
    pub id: u32,
    /// Position du clip dans la timeline en beats.
    pub start_beats: f64,
    /// Longueur du clip en beats.
    pub length_beats: f64,
    pub notes: Vec<MidiNote>,
}
