use serde::{Deserialize, Serialize};

// ── Modulation Matrix ────────────────────────────────────────────────────────

/// Source de modulation dans la matrice.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum ModSource {
    Envelope1,   // Enveloppe d'amplitude
    Envelope2,   // Enveloppe de filtre
    LFO1,
    LFO2,
    Velocity,    // Vélocité de la note (0.0–1.0)
    NoteNumber,  // Numéro de note normalisé (0.0–1.0 sur 0–127)
}

impl Default for ModSource {
    fn default() -> Self { ModSource::LFO1 }
}

impl ModSource {
    pub fn from_index(i: u32) -> Self {
        match i {
            0 => Self::Envelope1,
            1 => Self::Envelope2,
            2 => Self::LFO1,
            3 => Self::LFO2,
            4 => Self::Velocity,
            5 => Self::NoteNumber,
            _ => Self::LFO1,
        }
    }

    pub fn to_index(self) -> u32 {
        match self {
            Self::Envelope1 => 0,
            Self::Envelope2 => 1,
            Self::LFO1 => 2,
            Self::LFO2 => 3,
            Self::Velocity => 4,
            Self::NoteNumber => 5,
        }
    }
}

/// Un routage dans la matrice de modulation.
#[derive(Debug, Clone)]
pub struct ModRoute {
    pub id: u32,
    pub source: ModSource,
    pub destination: ModDestination,
    /// Intensité de modulation (-1.0 à +1.0).
    pub amount: f32,
}

/// Destination de modulation du LFO.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum ModDestination {
    Pitch,
    Cutoff,
    Volume,
    Pan,
    Osc2Pitch,
    Resonance,
}

impl Default for ModDestination {
    fn default() -> Self {
        ModDestination::Pitch
    }
}

impl ModDestination {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pitch" => Some(Self::Pitch),
            "cutoff" => Some(Self::Cutoff),
            "volume" => Some(Self::Volume),
            "pan" => Some(Self::Pan),
            "osc2pitch" => Some(Self::Osc2Pitch),
            "resonance" => Some(Self::Resonance),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pitch => "pitch",
            Self::Cutoff => "cutoff",
            Self::Volume => "volume",
            Self::Pan => "pan",
            Self::Osc2Pitch => "osc2pitch",
            Self::Resonance => "resonance",
        }
    }
}

/// Forme d'onde du LFO (réutilise les mêmes types mais inclut Sample & Hold).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum LfoWaveform {
    Sine,
    Square,
    Triangle,
    Saw,
    SampleAndHold,
}

impl Default for LfoWaveform {
    fn default() -> Self {
        LfoWaveform::Sine
    }
}

impl LfoWaveform {
    pub fn from_index(i: u32) -> Self {
        match i {
            0 => Self::Sine,
            1 => Self::Square,
            2 => Self::Triangle,
            3 => Self::Saw,
            4 => Self::SampleAndHold,
            _ => Self::Sine,
        }
    }

    pub fn to_index(self) -> u32 {
        match self {
            Self::Sine => 0,
            Self::Square => 1,
            Self::Triangle => 2,
            Self::Saw => 3,
            Self::SampleAndHold => 4,
        }
    }
}

/// Low Frequency Oscillator — module un paramètre du synthé de façon cyclique.
#[derive(Debug, Clone)]
pub struct LFO {
    pub waveform: LfoWaveform,
    /// Fréquence en Hz (0.1 à 20 Hz), ou ratio BPM si sync activé.
    pub rate: f32,
    /// Profondeur de modulation (0.0–1.0).
    pub depth: f32,
    /// Phase courante (0.0–1.0).
    phase: f64,
    /// Synchroniser au BPM (rate = ratio : 1.0 = noire, 0.5 = croche).
    pub sync_to_bpm: bool,
    /// Destination de modulation.
    pub destination: ModDestination,
    /// Valeur précédente du Sample & Hold (S&H ne change qu'au cycle).
    sh_value: f32,
    /// État PRNG pour S&H.
    sh_noise_state: u32,
}

impl LFO {
    pub fn new() -> Self {
        Self {
            waveform: LfoWaveform::Sine,
            rate: 1.0,
            depth: 0.0,
            phase: 0.0,
            sync_to_bpm: false,
            destination: ModDestination::Pitch,
            sh_value: 0.0,
            sh_noise_state: 54321,
        }
    }

    /// Retourne la valeur du LFO : [-depth, +depth].
    /// `bpm` est utilisé uniquement si `sync_to_bpm` est vrai.
    pub fn process(&mut self, sample_rate: u32, bpm: f64) -> f32 {
        let freq = if self.sync_to_bpm {
            // rate = ratio de beat (1.0 = noire = 1 cycle par beat)
            bpm / 60.0 * self.rate as f64
        } else {
            self.rate as f64
        };

        let prev_phase = self.phase;
        self.phase = (self.phase + freq / sample_rate as f64) % 1.0;

        let raw = match self.waveform {
            LfoWaveform::Sine => {
                (self.phase * 2.0 * std::f64::consts::PI).sin() as f32
            }
            LfoWaveform::Square => {
                if self.phase < 0.5 { 1.0 } else { -1.0 }
            }
            LfoWaveform::Triangle => {
                (4.0 * (self.phase - (self.phase + 0.5).floor()).abs() - 1.0) as f32
            }
            LfoWaveform::Saw => {
                (2.0 * self.phase - 1.0) as f32
            }
            LfoWaveform::SampleAndHold => {
                // Changer de valeur quand la phase passe par 0.
                if self.phase < prev_phase {
                    self.sh_noise_state ^= self.sh_noise_state << 13;
                    self.sh_noise_state ^= self.sh_noise_state >> 17;
                    self.sh_noise_state ^= self.sh_noise_state << 5;
                    self.sh_value = (self.sh_noise_state as f32 / u32::MAX as f32) * 2.0 - 1.0;
                }
                self.sh_value
            }
        };

        raw * self.depth
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lfo_sine_bounded() {
        let mut lfo = LFO::new();
        lfo.rate = 5.0;
        lfo.depth = 1.0;
        for _ in 0..48000 {
            let v = lfo.process(48000, 120.0);
            assert!(v >= -1.01 && v <= 1.01, "LFO sine hors bornes : {v}");
        }
    }

    #[test]
    fn test_lfo_zero_depth() {
        let mut lfo = LFO::new();
        lfo.rate = 5.0;
        lfo.depth = 0.0;
        for _ in 0..1000 {
            let v = lfo.process(48000, 120.0);
            assert_eq!(v, 0.0, "LFO doit être 0 si depth=0");
        }
    }

    #[test]
    fn test_lfo_bpm_sync() {
        let mut lfo = LFO::new();
        lfo.rate = 1.0;
        lfo.depth = 1.0;
        lfo.sync_to_bpm = true;
        // À 120 BPM, rate=1.0 → 2 Hz → 1 cycle en 24000 samples à 48kHz.
        let mut crossed_zero = 0;
        let mut prev = 0.0f32;
        for _ in 0..48000 {
            let v = lfo.process(48000, 120.0);
            if prev < 0.0 && v >= 0.0 {
                crossed_zero += 1;
            }
            prev = v;
        }
        // En 1 seconde à 2 Hz on attend 2 cycles → ~2 passages par zéro montants.
        assert!(crossed_zero >= 1 && crossed_zero <= 3, "Crossings: {crossed_zero}");
    }
}
