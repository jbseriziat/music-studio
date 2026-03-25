use super::envelope::Envelope;
use super::filter::Filter;
use super::oscillator::Oscillator;

/// Une voix de polyphonie du synthétiseur.
/// Phase 5 : double oscillateur + osc_mix.
#[derive(Debug, Clone)]
pub struct SynthVoice {
    pub oscillator: Oscillator,
    /// Deuxième oscillateur (Phase 5).
    pub oscillator2: Oscillator,
    pub envelope: Envelope,
    pub filter: Filter,
    /// Note MIDI jouée (0–127).
    pub note: u8,
    /// Vélocité normalisée (0.0–1.0).
    pub velocity: f32,
    /// La voix est-elle active (joue du son) ?
    pub active: bool,
    /// Compteur pour le voice stealing : plus grand = plus récent.
    pub age: u64,
    /// Mix entre osc1 et osc2 (0.0 = 100% osc1, 1.0 = 100% osc2). Phase 5.
    pub osc_mix: f32,
    /// Active le deuxième oscillateur. Phase 5.
    pub osc2_enabled: bool,
}

impl SynthVoice {
    pub fn new() -> Self {
        Self {
            oscillator: Oscillator::new(),
            oscillator2: Oscillator::new(),
            envelope: Envelope::new(),
            filter: Filter::new(),
            note: 0,
            velocity: 1.0,
            active: false,
            age: 0,
            osc_mix: 0.5,
            osc2_enabled: false,
        }
    }

    /// Génère un échantillon mono : oscillateurs → mix → enveloppe → filtre × vélocité.
    /// Retourne 0.0 si la voix est inactive.
    pub fn process(&mut self, sample_rate: u32) -> f32 {
        if !self.active {
            return 0.0;
        }
        let osc1 = self.oscillator.generate(sample_rate);
        let osc_signal = if self.osc2_enabled {
            let osc2 = self.oscillator2.generate(sample_rate);
            osc1 * (1.0 - self.osc_mix) + osc2 * self.osc_mix
        } else {
            osc1
        };
        let env = self.envelope.process(sample_rate);
        let filtered = self.filter.process(osc_signal * env);
        filtered * self.velocity
    }

    /// Génère un échantillon avec modulation de fréquence (pour le LFO pitch).
    /// `freq_mod` est un facteur multiplicatif (1.0 = pas de modulation).
    pub fn process_with_mod(&mut self, sample_rate: u32, freq_mod: f64) -> f32 {
        if !self.active {
            return 0.0;
        }
        let osc1 = self.oscillator.generate_with_mod(sample_rate, freq_mod);
        let osc_signal = if self.osc2_enabled {
            let osc2 = self.oscillator2.generate_with_mod(sample_rate, freq_mod);
            osc1 * (1.0 - self.osc_mix) + osc2 * self.osc_mix
        } else {
            osc1
        };
        let env = self.envelope.process(sample_rate);
        let filtered = self.filter.process(osc_signal * env);
        filtered * self.velocity
    }

    /// Remet la voix à zéro (voice stealing sans clic).
    pub fn reset(&mut self) {
        self.active = false;
        self.envelope.reset();
        self.filter.reset();
    }
}
