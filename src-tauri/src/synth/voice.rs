use super::envelope::Envelope;
use super::filter::Filter;
use super::oscillator::Oscillator;

/// Une voix de polyphonie du synthétiseur.
/// Chaque voix contient son propre oscillateur, enveloppe et filtre.
#[derive(Debug, Clone)]
pub struct SynthVoice {
    pub oscillator: Oscillator,
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
}

impl SynthVoice {
    pub fn new() -> Self {
        Self {
            oscillator: Oscillator::new(),
            envelope: Envelope::new(),
            filter: Filter::new(),
            note: 0,
            velocity: 1.0,
            active: false,
            age: 0,
        }
    }

    /// Génère un échantillon mono : oscillateur → enveloppe → filtre × vélocité.
    /// Retourne 0.0 si la voix est inactive.
    pub fn process(&mut self, sample_rate: u32) -> f32 {
        if !self.active {
            return 0.0;
        }
        let osc = self.oscillator.generate(sample_rate);
        let env = self.envelope.process(sample_rate);
        let filtered = self.filter.process(osc * env);
        filtered * self.velocity
    }

    /// Remet la voix à zéro (voice stealing sans clic).
    pub fn reset(&mut self) {
        self.active = false;
        self.envelope.reset();
        self.filter.reset();
    }
}
