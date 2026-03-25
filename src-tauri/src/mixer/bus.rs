use crate::effects::EffectChain;

/// Nombre maximal de bus d'effets.
pub const MAX_BUSES: usize = 4;

/// Un bus d'effets send/return.
pub struct EffectBus {
    pub id: u32,
    pub name: String,
    pub effect_chain: EffectChain,
    pub volume: f32,
    /// Accumulateur stéréo pour la frame courante (remis à 0 chaque frame).
    pub accum_l: f32,
    pub accum_r: f32,
    pub active: bool,
}

impl std::fmt::Debug for EffectBus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "EffectBus(id={}, name={})", self.id, self.name)
    }
}

impl EffectBus {
    pub fn new(id: u32, name: String) -> Self {
        Self {
            id,
            name,
            effect_chain: EffectChain::new(),
            volume: 1.0,
            accum_l: 0.0,
            accum_r: 0.0,
            active: true,
        }
    }

    /// Remet l'accumulateur à zéro pour la prochaine frame.
    pub fn clear_accum(&mut self) {
        self.accum_l = 0.0;
        self.accum_r = 0.0;
    }

    /// Ajoute du signal dans l'accumulateur du bus.
    pub fn feed(&mut self, l: f32, r: f32) {
        self.accum_l += l;
        self.accum_r += r;
    }

    /// Traite le signal accumulé à travers la chaîne d'effets et retourne la sortie stéréo.
    /// Le bus est 100% wet (pas de dry).
    pub fn process(&mut self) -> (f32, f32) {
        if !self.active {
            self.clear_accum();
            return (0.0, 0.0);
        }
        let (l, r) = self.effect_chain.process(self.accum_l, self.accum_r);
        self.clear_accum();
        (l * self.volume, r * self.volume)
    }
}

/// Send d'une piste vers un bus.
#[derive(Debug, Clone)]
pub struct Send {
    pub bus_id: u32,
    pub amount: f32, // 0.0–1.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bus_passthrough_with_no_effects() {
        let mut bus = EffectBus::new(1, "Test".to_string());
        bus.feed(0.5, -0.3);
        let (l, r) = bus.process();
        assert!((l - 0.5).abs() < 0.001);
        assert!((r + 0.3).abs() < 0.001);
    }

    #[test]
    fn test_bus_accumulates_multiple_feeds() {
        let mut bus = EffectBus::new(1, "Test".to_string());
        bus.feed(0.3, 0.2);
        bus.feed(0.4, 0.1);
        let (l, r) = bus.process();
        assert!((l - 0.7).abs() < 0.001);
        assert!((r - 0.3).abs() < 0.001);
    }

    #[test]
    fn test_bus_volume() {
        let mut bus = EffectBus::new(1, "Test".to_string());
        bus.volume = 0.5;
        bus.feed(1.0, 1.0);
        let (l, r) = bus.process();
        assert!((l - 0.5).abs() < 0.001);
        assert!((r - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_bus_clears_accum_after_process() {
        let mut bus = EffectBus::new(1, "Test".to_string());
        bus.feed(0.5, 0.5);
        bus.process();
        let (l, r) = bus.process();
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);
    }
}
