use super::envelope::Envelope;
use super::filter::Filter;
use super::oscillator::Oscillator;

/// Une voix de polyphonie du synthétiseur.
/// Phase 5 : double oscillateur + osc_mix + filter envelope.
#[derive(Debug, Clone)]
pub struct SynthVoice {
    pub oscillator: Oscillator,
    pub oscillator2: Oscillator,
    pub envelope: Envelope,
    /// Enveloppe dédiée au filtre (Phase 5.2). Module le cutoff.
    pub filter_envelope: Envelope,
    pub filter: Filter,
    /// Note MIDI jouée (0–127).
    pub note: u8,
    /// Vélocité normalisée (0.0–1.0).
    pub velocity: f32,
    pub active: bool,
    pub age: u64,
    pub osc_mix: f32,
    pub osc2_enabled: bool,
    /// Intensité de la modulation filter envelope → cutoff (0.0–1.0).
    pub filter_env_amount: f32,
    /// Cutoff de base (avant modulations).
    pub base_cutoff: f32,
}

impl SynthVoice {
    pub fn new() -> Self {
        let mut filter_env = Envelope::new();
        filter_env.attack = 0.005;
        filter_env.decay = 0.200;
        filter_env.sustain = 0.0;
        filter_env.release = 0.300;

        Self {
            oscillator: Oscillator::new(),
            oscillator2: Oscillator::new(),
            envelope: Envelope::new(),
            filter_envelope: filter_env,
            filter: Filter::new(),
            note: 0,
            velocity: 1.0,
            active: false,
            age: 0,
            osc_mix: 0.5,
            osc2_enabled: false,
            filter_env_amount: 0.0,
            base_cutoff: 8000.0,
        }
    }

    /// Génère un échantillon mono avec toutes les modulations.
    pub fn process_full(
        &mut self,
        sample_rate: u32,
        freq_mod: f64,
        cutoff_mod: f32,
        velocity_cutoff_mod: f32,
    ) -> f32 {
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

        // Enveloppe de filtre → modulation du cutoff.
        let filt_env = self.filter_envelope.process(sample_rate);
        let mod_cutoff = self.base_cutoff
            + filt_env * self.filter_env_amount * 10000.0
            + cutoff_mod
            + velocity_cutoff_mod;
        self.filter.cutoff = mod_cutoff.clamp(20.0, 20000.0);
        self.filter.update_coefficients(sample_rate);

        let filtered = self.filter.process(osc_signal * env);
        filtered * self.velocity
    }

    /// Version simple (rétrocompatible).
    pub fn process(&mut self, sample_rate: u32) -> f32 {
        self.process_full(sample_rate, 1.0, 0.0, 0.0)
    }

    /// Version avec modulation de fréquence uniquement.
    pub fn process_with_mod(&mut self, sample_rate: u32, freq_mod: f64) -> f32 {
        self.process_full(sample_rate, freq_mod, 0.0, 0.0)
    }

    pub fn reset(&mut self) {
        self.active = false;
        self.envelope.reset();
        self.filter_envelope.reset();
        self.filter.reset();
    }
}
