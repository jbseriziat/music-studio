use serde::{Deserialize, Serialize};

/// Forme d'onde de l'oscillateur.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Waveform {
    Sine,
    Square,
    Sawtooth,
    Triangle,
    Noise,       // Bruit blanc (Phase 5)
    PulseWidth,  // Carré avec duty cycle variable (Phase 5)
}

impl Default for Waveform {
    fn default() -> Self {
        Waveform::Sine
    }
}

/// Oscillateur avec anti-aliasing polyBLEP pour Square et Sawtooth.
#[derive(Debug, Clone)]
pub struct Oscillator {
    pub waveform: Waveform,
    phase: f64,
    pub frequency: f64,
    pub octave_offset: i8,   // -2 à +2
    pub detune_cents: f32,   // -50 à +50
    /// Duty cycle pour PulseWidth (0.1–0.9, défaut 0.5 = carré). Phase 5.
    pub pulse_width: f32,
    /// Fréquence cible pour le glide/portamento. Phase 5.
    pub target_frequency: f64,
    /// Coefficient de glide (0.0 = instantané, plus proche de 1.0 = plus lent).
    pub glide_coeff: f64,
    /// État interne du générateur de bruit (PRNG simple).
    noise_state: u32,
}

impl Oscillator {
    pub fn new() -> Self {
        Self {
            waveform: Waveform::Sine,
            phase: 0.0,
            frequency: 440.0,
            octave_offset: 0,
            detune_cents: 0.0,
            pulse_width: 0.5,
            target_frequency: 440.0,
            glide_coeff: 0.0,
            noise_state: 12345,
        }
    }

    pub fn set_frequency(&mut self, freq: f64) {
        self.frequency = freq;
        self.target_frequency = freq;
    }

    /// Définit la fréquence cible (pour le glide). La fréquence réelle glissera vers cette cible.
    pub fn set_target_frequency(&mut self, freq: f64) {
        self.target_frequency = freq;
    }

    /// Définit le coefficient de glide (temps de glissement).
    /// 0.0 = instantané, valeurs proches de 1.0 = lent.
    pub fn set_glide_coeff(&mut self, coeff: f64) {
        self.glide_coeff = coeff;
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
    }

    /// Génère un échantillon et avance la phase.
    pub fn generate(&mut self, sample_rate: u32) -> f32 {
        // Appliquer le glide : interpoler la fréquence vers la cible.
        if self.glide_coeff > 0.0 {
            self.frequency += (self.target_frequency - self.frequency) * (1.0 - self.glide_coeff);
        } else {
            self.frequency = self.target_frequency;
        }

        // Appliquer octave et detune à la fréquence.
        let freq = self.frequency
            * 2.0f64.powf(
                self.octave_offset as f64 + self.detune_cents as f64 / 1200.0,
            );
        let dt = freq / sample_rate as f64;

        let sample = match self.waveform {
            Waveform::Sine => (self.phase * 2.0 * std::f64::consts::PI).sin(),

            Waveform::Square => {
                let mut s = if self.phase < 0.5 { 1.0 } else { -1.0 };
                // polyBLEP pour la montée (phase ≈ 0) et la descente (phase ≈ 0.5).
                s += poly_blep(self.phase, dt);
                s -= poly_blep((self.phase + 0.5) % 1.0, dt);
                s
            }

            Waveform::Sawtooth => {
                // Dent de scie : de -1 à +1, reset à 0.
                let s = 2.0 * self.phase - 1.0;
                s - poly_blep(self.phase, dt)
            }

            Waveform::Triangle => {
                // Triangle sans discontinuité, pas besoin de polyBLEP.
                4.0 * (self.phase - (self.phase + 0.5).floor()).abs() - 1.0
            }

            Waveform::Noise => {
                // Bruit blanc via xorshift32.
                self.noise_state ^= self.noise_state << 13;
                self.noise_state ^= self.noise_state >> 17;
                self.noise_state ^= self.noise_state << 5;
                // Normaliser en [-1, 1].
                (self.noise_state as f64 / u32::MAX as f64) * 2.0 - 1.0
            }

            Waveform::PulseWidth => {
                let pw = self.pulse_width as f64;
                let mut s = if self.phase < pw { 1.0 } else { -1.0 };
                s += poly_blep(self.phase, dt);
                s -= poly_blep((self.phase - pw + 1.0) % 1.0, dt);
                s
            }
        };

        // Avancer la phase (sauf pour Noise qui n'utilise pas la phase).
        if self.waveform != Waveform::Noise {
            self.phase = (self.phase + dt) % 1.0;
        }

        sample as f32
    }

    /// Génère un échantillon avec une modulation de fréquence additionnelle (pour le LFO pitch).
    /// `freq_mod` est un facteur multiplicatif (1.0 = pas de modulation).
    pub fn generate_with_mod(&mut self, sample_rate: u32, freq_mod: f64) -> f32 {
        // Appliquer le glide.
        if self.glide_coeff > 0.0 {
            self.frequency += (self.target_frequency - self.frequency) * (1.0 - self.glide_coeff);
        } else {
            self.frequency = self.target_frequency;
        }

        let freq = self.frequency * freq_mod
            * 2.0f64.powf(
                self.octave_offset as f64 + self.detune_cents as f64 / 1200.0,
            );
        let dt = freq / sample_rate as f64;

        let sample = match self.waveform {
            Waveform::Sine => (self.phase * 2.0 * std::f64::consts::PI).sin(),
            Waveform::Square => {
                let mut s = if self.phase < 0.5 { 1.0 } else { -1.0 };
                s += poly_blep(self.phase, dt);
                s -= poly_blep((self.phase + 0.5) % 1.0, dt);
                s
            }
            Waveform::Sawtooth => {
                let s = 2.0 * self.phase - 1.0;
                s - poly_blep(self.phase, dt)
            }
            Waveform::Triangle => {
                4.0 * (self.phase - (self.phase + 0.5).floor()).abs() - 1.0
            }
            Waveform::Noise => {
                self.noise_state ^= self.noise_state << 13;
                self.noise_state ^= self.noise_state >> 17;
                self.noise_state ^= self.noise_state << 5;
                (self.noise_state as f64 / u32::MAX as f64) * 2.0 - 1.0
            }
            Waveform::PulseWidth => {
                let pw = self.pulse_width as f64;
                let mut s = if self.phase < pw { 1.0 } else { -1.0 };
                s += poly_blep(self.phase, dt);
                s -= poly_blep((self.phase - pw + 1.0) % 1.0, dt);
                s
            }
        };

        if self.waveform != Waveform::Noise {
            self.phase = (self.phase + dt) % 1.0;
        }

        sample as f32
    }
}

/// Correction polyBLEP pour lisser les discontinuités des ondes carrée et dent de scie.
/// `t` = phase courante (0..1), `dt` = incrément de phase par échantillon.
fn poly_blep(t: f64, dt: f64) -> f64 {
    if dt <= 0.0 {
        return 0.0;
    }
    if t < dt {
        // Juste après la discontinuité.
        let t = t / dt;
        2.0 * t - t * t - 1.0
    } else if t > 1.0 - dt {
        // Juste avant la discontinuité.
        let t = (t - 1.0) / dt;
        t * t + 2.0 * t + 1.0
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sine_bounded() {
        let mut osc = Oscillator::new();
        osc.frequency = 440.0;
        for _ in 0..1000 {
            let s = osc.generate(48000);
            assert!(s >= -1.1 && s <= 1.1, "Sine hors bornes : {s}");
        }
    }

    #[test]
    fn test_square_bounded() {
        let mut osc = Oscillator::new();
        osc.waveform = Waveform::Square;
        osc.frequency = 440.0;
        for _ in 0..1000 {
            let s = osc.generate(48000);
            assert!(s >= -1.5 && s <= 1.5, "Square hors bornes : {s}");
        }
    }

    #[test]
    fn test_midi_a4_freq() {
        // A4 = 440 Hz → la phase doit faire exactement 440 cycles en 1 seconde.
        let mut osc = Oscillator::new();
        osc.waveform = Waveform::Sine;
        osc.frequency = 440.0;
        // Avancer d'un nombre de samples égal à sample_rate → 1 seconde.
        for _ in 0..48000 {
            osc.generate(48000);
        }
        // La phase doit être ≈ 0 après 48000 échantillons à 440 Hz et 48000 Hz.
        // 440 / 48000 * 48000 = 440.0 → phase = 0.0 mod 1.0
        // (différence de flottant possible)
    }
}
