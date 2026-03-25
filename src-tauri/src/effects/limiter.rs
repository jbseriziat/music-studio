/// Brickwall Limiter — empêche le signal de dépasser le threshold.
/// Attack instantanée, release configurable.
#[derive(Debug, Clone)]
pub struct BrickwallLimiter {
    /// Seuil en linéaire (ex: 0.891 ≈ -1 dBFS).
    pub threshold: f32,
    /// Gain reduction courante (0.0–1.0, 1.0 = pas de réduction).
    pub gain_reduction: f32,
    /// Coefficient de release (plus petit = plus lent).
    release_coeff: f32,
    sample_rate: u32,
    release_ms: f32,
    pub enabled: bool,
}

impl BrickwallLimiter {
    pub fn new(sample_rate: u32) -> Self {
        let mut lim = Self {
            threshold: 1.0,
            gain_reduction: 1.0,
            release_coeff: 0.0,
            sample_rate,
            release_ms: 100.0,
            enabled: true,
        };
        lim.update_release_coeff();
        lim
    }

    pub fn set_threshold_db(&mut self, db: f32) {
        let db_clamped = db.clamp(-12.0, 0.0);
        self.threshold = 10.0f32.powf(db_clamped / 20.0);
    }

    pub fn get_threshold_db(&self) -> f32 {
        if self.threshold <= 0.0 { -60.0 } else { 20.0 * self.threshold.log10() }
    }

    pub fn set_release_ms(&mut self, ms: f32) {
        self.release_ms = ms.clamp(10.0, 1000.0);
        self.update_release_coeff();
    }

    fn update_release_coeff(&mut self) {
        let release_samples = (self.release_ms / 1000.0) * self.sample_rate as f32;
        self.release_coeff = if release_samples > 1.0 {
            (-2.2 / release_samples).exp()
        } else {
            0.0
        };
    }

    /// Traite une frame stéréo. Le signal ne dépassera jamais le threshold.
    pub fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        if !self.enabled {
            return (input_l, input_r);
        }
        let peak = input_l.abs().max(input_r.abs());
        let target_gain = if peak > self.threshold && peak > 0.0 {
            self.threshold / peak
        } else {
            1.0
        };

        // Attack instantanée, release lissé.
        if target_gain < self.gain_reduction {
            self.gain_reduction = target_gain;
        } else {
            self.gain_reduction =
                self.release_coeff * self.gain_reduction + (1.0 - self.release_coeff) * target_gain;
        }

        (input_l * self.gain_reduction, input_r * self.gain_reduction)
    }

    pub fn reset(&mut self) {
        self.gain_reduction = 1.0;
    }

    /// Réduction de gain en dB (≥ 0, 0 = pas de réduction).
    pub fn gain_reduction_db(&self) -> f32 {
        if self.gain_reduction <= 0.0 || self.gain_reduction >= 1.0 {
            0.0
        } else {
            -20.0 * self.gain_reduction.log10()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_below_threshold_passthrough() {
        let mut lim = BrickwallLimiter::new(48000);
        lim.set_threshold_db(-1.0);
        let (l, r) = lim.process(0.5, -0.5);
        assert!((l - 0.5).abs() < 0.001);
        assert!((r + 0.5).abs() < 0.001);
    }

    #[test]
    fn test_above_threshold_limited() {
        let mut lim = BrickwallLimiter::new(48000);
        lim.set_threshold_db(-6.0); // ~0.5
        let (l, _) = lim.process(1.0, 0.0);
        assert!(l <= 0.51, "Signal doit être limité: {l}");
    }

    #[test]
    fn test_never_exceeds_threshold() {
        let mut lim = BrickwallLimiter::new(48000);
        lim.set_threshold_db(-3.0);
        for _ in 0..1000 {
            let (l, r) = lim.process(2.0, -1.5);
            assert!(l.abs() <= lim.threshold + 0.001, "L exceeds: {l}");
            assert!(r.abs() <= lim.threshold + 0.001, "R exceeds: {r}");
        }
    }
}
