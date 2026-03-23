/// Gestion de l'horloge musicale : position, play/pause/stop.
///
/// Struct pure, sans I/O ni allocation : utilisable dans le thread audio.
/// L'AudioEngine intègre la même logique via `AudioCallbackState` (position_frames,
/// is_playing) — cette struct sert de référence de design et sera utilisée
/// directement dans les phases suivantes (séquenceur, métronome).
pub struct Transport {
    pub is_playing: bool,
    /// Position courante en secondes.
    pub position: f64,
    pub sample_rate: u32,
}

impl Transport {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            is_playing: false,
            position: 0.0,
            sample_rate,
        }
    }

    /// Démarre la lecture.
    pub fn play(&mut self) {
        self.is_playing = true;
    }

    /// Met en pause sans réinitialiser la position.
    pub fn pause(&mut self) {
        self.is_playing = false;
    }

    /// Arrête la lecture et remet la position à 0.
    pub fn stop(&mut self) {
        self.is_playing = false;
        self.position = 0.0;
    }

    /// Avance la position de `num_samples` frames audio si en lecture.
    /// À appeler une fois par cycle audio dans le callback.
    pub fn advance(&mut self, num_samples: u64) {
        if self.is_playing {
            self.position += num_samples as f64 / self.sample_rate as f64;
        }
    }

    /// Repositionne la lecture à une position donnée (en secondes).
    pub fn seek(&mut self, position_secs: f64) {
        self.position = position_secs.max(0.0);
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_state() {
        let t = Transport::new(48000);
        assert!(!t.is_playing);
        assert_eq!(t.position, 0.0);
        assert_eq!(t.sample_rate, 48000);
    }

    #[test]
    fn test_play_stop() {
        let mut t = Transport::new(48000);
        t.play();
        assert!(t.is_playing);
        // Avancer d'une seconde (48000 samples à 48kHz)
        t.advance(48000);
        assert!((t.position - 1.0).abs() < 1e-9);
        t.stop();
        assert!(!t.is_playing);
        assert_eq!(t.position, 0.0);
    }

    #[test]
    fn test_pause_keeps_position() {
        let mut t = Transport::new(48000);
        t.play();
        t.advance(24000); // 0.5s
        t.pause();
        assert!(!t.is_playing);
        assert!((t.position - 0.5).abs() < 1e-9);
        // En pause, advance ne doit pas bouger la position
        t.advance(24000);
        assert!((t.position - 0.5).abs() < 1e-9);
    }

    #[test]
    fn test_seek() {
        let mut t = Transport::new(48000);
        t.play();
        t.advance(48000); // 1s
        t.seek(2.5);
        assert!((t.position - 2.5).abs() < 1e-9);
    }

    #[test]
    fn test_advance_increments_correctly() {
        let mut t = Transport::new(48000);
        t.play();
        // 512 samples = ~10.67ms
        t.advance(512);
        let expected = 512.0 / 48000.0;
        assert!((t.position - expected).abs() < 1e-9);
    }
}
