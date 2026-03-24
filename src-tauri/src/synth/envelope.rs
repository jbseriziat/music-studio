/// États possibles de l'enveloppe ADSR.
#[derive(Debug, Clone, PartialEq)]
pub enum EnvelopeState {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

/// Enveloppe ADSR contrôlant l'amplitude dans le temps.
#[derive(Debug, Clone)]
pub struct Envelope {
    pub attack: f32,   // secondes, min 1ms
    pub decay: f32,    // secondes, min 1ms
    pub sustain: f32,  // 0.0 – 1.0
    pub release: f32,  // secondes, min 1ms
    pub state: EnvelopeState,
    pub level: f32,
}

impl Envelope {
    /// Valeurs par défaut musicales : A=10ms, D=100ms, S=70%, R=200ms.
    pub fn new() -> Self {
        Self {
            attack: 0.010,
            decay: 0.100,
            sustain: 0.7,
            release: 0.200,
            state: EnvelopeState::Idle,
            level: 0.0,
        }
    }

    /// Déclenche la phase Attack (note pressée).
    /// Le level repart de sa valeur actuelle pour éviter les clics.
    pub fn trigger(&mut self) {
        self.state = EnvelopeState::Attack;
        // On ne remet pas level à 0 : retrigger sans clic.
    }

    /// Déclenche la phase Release (note relâchée).
    pub fn release(&mut self) {
        if self.state != EnvelopeState::Idle {
            self.state = EnvelopeState::Release;
        }
    }

    /// Calcule et retourne le niveau courant de l'enveloppe, avance l'état.
    pub fn process(&mut self, sample_rate: u32) -> f32 {
        match self.state {
            EnvelopeState::Attack => {
                let attack_samples = (self.attack * sample_rate as f32).max(1.0);
                self.level += 1.0 / attack_samples;
                if self.level >= 1.0 {
                    self.level = 1.0;
                    self.state = EnvelopeState::Decay;
                }
            }
            EnvelopeState::Decay => {
                let decay_samples = (self.decay * sample_rate as f32).max(1.0);
                self.level -= (1.0 - self.sustain) / decay_samples;
                if self.level <= self.sustain {
                    self.level = self.sustain;
                    self.state = EnvelopeState::Sustain;
                }
            }
            EnvelopeState::Sustain => {
                // Le niveau reste à sustain.
            }
            EnvelopeState::Release => {
                let release_samples = (self.release * sample_rate as f32).max(1.0);
                // Décroissance exponentielle : évite d'atteindre exactement 0.
                self.level -= self.level / release_samples;
                if self.level < 0.0001 {
                    self.level = 0.0;
                    self.state = EnvelopeState::Idle;
                }
            }
            EnvelopeState::Idle => {
                self.level = 0.0;
            }
        }
        self.level
    }

    pub fn is_idle(&self) -> bool {
        self.state == EnvelopeState::Idle
    }

    /// Remet l'enveloppe à zéro (utilisé lors du voice stealing).
    pub fn reset(&mut self) {
        self.state = EnvelopeState::Idle;
        self.level = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adsr_lifecycle() {
        let mut env = Envelope::new();
        env.attack = 0.001;
        env.decay = 0.001;
        env.sustain = 0.5;
        env.release = 0.001;

        env.trigger();
        assert_eq!(env.state, EnvelopeState::Attack);

        // Avancer jusqu'à la phase Sustain.
        for _ in 0..10000 {
            env.process(48000);
            if env.state == EnvelopeState::Sustain { break; }
        }
        assert_eq!(env.state, EnvelopeState::Sustain);
        assert!((env.level - 0.5).abs() < 0.01, "Level sustain incorrect : {}", env.level);

        env.release();
        assert_eq!(env.state, EnvelopeState::Release);

        // Avancer jusqu'à Idle.
        for _ in 0..100000 {
            env.process(48000);
            if env.is_idle() { break; }
        }
        assert!(env.is_idle(), "L'enveloppe n'est pas revenue à Idle");
    }

    #[test]
    fn test_level_bounded() {
        let mut env = Envelope::new();
        env.trigger();
        for _ in 0..100000 {
            let l = env.process(48000);
            assert!(l >= 0.0 && l <= 1.0001, "Level hors bornes : {l}");
        }
    }
}
