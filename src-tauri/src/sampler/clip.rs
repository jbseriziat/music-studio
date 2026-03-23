use serde::{Deserialize, Serialize};

/// Représentation d'un clip audio sur la timeline (côté sampler).
///
/// Un `AudioClip` associe un sample à une position et une durée dans le temps.
/// Il est utilisé pour stocker l'état des clips dans le projet et
/// coordonner le chargement des samples avec le moteur audio.
///
/// Note : le moteur audio utilise `TimelineClip` (en frames) dans le callback —
/// `AudioClip` est la version lisible par l'humain (en secondes) utilisée pour
/// la sérialisation et la communication IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioClip {
    /// Identifiant unique du clip (numérique, correspondant au clip_id audio).
    pub id: u32,
    /// Identifiant de la piste parente (numérique, hashé depuis l'UUID frontend).
    pub track_id: u32,
    /// Identifiant du sample dans la banque.
    pub sample_id: u32,
    /// Position de début dans la timeline, en secondes.
    pub position: f64,
    /// Durée du clip, en secondes.
    pub duration: f64,
}

impl AudioClip {
    pub fn new(id: u32, track_id: u32, sample_id: u32, position: f64, duration: f64) -> Self {
        Self {
            id,
            track_id,
            sample_id,
            position,
            duration,
        }
    }

    /// Convertit la position en frames audio selon le sample rate.
    pub fn position_frames(&self, sample_rate: u32) -> u64 {
        (self.position * sample_rate as f64) as u64
    }

    /// Convertit la durée en frames audio selon le sample rate.
    pub fn duration_frames(&self, sample_rate: u32) -> u64 {
        (self.duration * sample_rate as f64) as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_clip() {
        let clip = AudioClip::new(1, 0, 5, 2.0, 1.5);
        assert_eq!(clip.id, 1);
        assert_eq!(clip.track_id, 0);
        assert_eq!(clip.sample_id, 5);
        assert!((clip.position - 2.0).abs() < f64::EPSILON);
        assert!((clip.duration - 1.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_position_frames() {
        let clip = AudioClip::new(1, 0, 5, 1.0, 0.5);
        // 1.0s à 48000 Hz = 48000 frames
        assert_eq!(clip.position_frames(48000), 48000);
        // 0.5s à 48000 Hz = 24000 frames
        assert_eq!(clip.duration_frames(48000), 24000);
    }

    #[test]
    fn test_serialization() {
        let clip = AudioClip::new(42, 1, 3, 5.5, 2.25);
        let json = serde_json::to_string(&clip).unwrap();
        let back: AudioClip = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, clip.id);
        assert_eq!(back.sample_id, clip.sample_id);
        assert!((back.position - clip.position).abs() < f64::EPSILON);
    }
}
