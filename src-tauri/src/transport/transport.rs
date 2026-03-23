/// Gestion de l'horloge musicale : position, play/pause/stop, tempo.
///
/// Struct pure, sans I/O ni allocation : utilisable dans le thread audio.
/// Fournit les conversions secondes ↔ beats et le calcul des durées en samples.
pub struct Transport {
    pub is_playing: bool,
    /// Position courante en secondes.
    pub position: f64,
    /// Position courante en beats (mise à jour par advance()).
    pub beat_position: f64,
    /// Tempo en BPM (défaut 120.0). Plage recommandée : 20–300.
    pub bpm: f64,
    pub sample_rate: u32,
}

impl Transport {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            is_playing: false,
            position: 0.0,
            beat_position: 0.0,
            bpm: 120.0,
            sample_rate,
        }
    }

    // ─── Conversion temps ↔ beats ─────────────────────────────────────────────

    /// Convertit une durée en secondes en beats.
    /// beats = secondes × (bpm / 60)
    pub fn beats_from_secs(&self, secs: f64) -> f64 {
        secs * self.bpm / 60.0
    }

    /// Convertit une position en beats en secondes.
    /// secondes = beats × (60 / bpm)
    pub fn secs_from_beats(&self, beats: f64) -> f64 {
        beats * 60.0 / self.bpm
    }

    // ─── Durées en samples ────────────────────────────────────────────────────

    /// Nombre de samples par beat (noire).
    /// samples_per_beat = sample_rate × 60 / bpm
    pub fn samples_per_beat(&self) -> f64 {
        self.sample_rate as f64 * 60.0 / self.bpm
    }

    /// Nombre de samples par step (double-croche = 1/16 de mesure 4/4).
    /// samples_per_step = samples_per_beat / 4
    pub fn samples_per_step(&self) -> f64 {
        self.samples_per_beat() / 4.0
    }

    // ─── Transport ────────────────────────────────────────────────────────────

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
        self.beat_position = 0.0;
    }

    /// Avance la position de `num_samples` frames audio si en lecture.
    /// Met à jour position (secondes) ET beat_position (beats) simultanément.
    pub fn advance(&mut self, num_samples: u64) {
        if self.is_playing {
            let dt = num_samples as f64 / self.sample_rate as f64;
            self.position += dt;
            self.beat_position += dt * self.bpm / 60.0;
        }
    }

    /// Repositionne la lecture à une position donnée (en secondes).
    /// Recalcule beat_position en cohérence.
    pub fn seek(&mut self, position_secs: f64) {
        self.position = position_secs.max(0.0);
        self.beat_position = self.beats_from_secs(self.position);
    }

    /// Modifie le BPM et recalcule beat_position pour rester cohérent
    /// avec la position en secondes courante.
    pub fn set_bpm(&mut self, bpm: f64) {
        self.bpm = bpm.clamp(20.0, 300.0);
        self.beat_position = self.beats_from_secs(self.position);
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
        assert_eq!(t.beat_position, 0.0);
        assert_eq!(t.bpm, 120.0);
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
        // À 120 BPM, 1 seconde = 2 beats
        assert!((t.beat_position - 2.0).abs() < 1e-9);
        t.stop();
        assert!(!t.is_playing);
        assert_eq!(t.position, 0.0);
        assert_eq!(t.beat_position, 0.0);
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
    fn test_seek_recalculates_beats() {
        let mut t = Transport::new(48000);
        t.play();
        t.advance(48000); // 1s
        t.seek(2.5);
        assert!((t.position - 2.5).abs() < 1e-9);
        // À 120 BPM : beat_position = 2.5 × 2 = 5.0 beats
        assert!((t.beat_position - 5.0).abs() < 1e-9);
    }

    #[test]
    fn test_beat_conversion_120bpm() {
        let t = Transport::new(48000);
        // À 120 BPM : 1 beat = 0.5s, 2 beats = 1s
        assert!((t.beats_from_secs(1.0) - 2.0).abs() < 1e-9);
        assert!((t.secs_from_beats(2.0) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_samples_per_beat_120bpm() {
        let t = Transport::new(48000);
        // 48000 × 60 / 120 = 24000 samples/beat
        assert!((t.samples_per_beat() - 24000.0).abs() < 1e-6);
        // samples_per_step = 24000 / 4 = 6000
        assert!((t.samples_per_step() - 6000.0).abs() < 1e-6);
    }

    #[test]
    fn test_set_bpm_recalculates_beat_position() {
        let mut t = Transport::new(48000);
        t.play();
        t.advance(48000); // 1s à 120 BPM → 2 beats
        assert!((t.beat_position - 2.0).abs() < 1e-9);
        // Passer à 60 BPM : même position 1s → 1 beat
        t.set_bpm(60.0);
        assert!((t.beat_position - 1.0).abs() < 1e-9);
        assert!((t.position - 1.0).abs() < 1e-9); // position en secs inchangée
    }

    #[test]
    fn test_advance_increments_correctly() {
        let mut t = Transport::new(48000);
        t.play();
        // 512 samples = ~10.67ms
        t.advance(512);
        let expected = 512.0 / 48000.0;
        assert!((t.position - expected).abs() < 1e-9);
        // beat_position = secs × 2 beats/s (à 120 BPM)
        assert!((t.beat_position - expected * 2.0).abs() < 1e-9);
    }
}
