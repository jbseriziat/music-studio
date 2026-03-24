use serde::{Deserialize, Serialize};

/// Type de filtre (seul LowPass actif au niveau 3).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum FilterType {
    LowPass,
    HighPass,  // niveau 5
    BandPass,  // niveau 5
}

impl Default for FilterType {
    fn default() -> Self {
        FilterType::LowPass
    }
}

/// Filtre biquad IIR (2 pôles, 2 zéros).
/// Formule directe II : y[n] = b0·x[n] + b1·x[n-1] + b2·x[n-2] - a1·y[n-1] - a2·y[n-2]
#[derive(Debug, Clone)]
pub struct Filter {
    pub filter_type: FilterType,
    pub cutoff: f32,     // Hz, 20–20000
    pub resonance: f32,  // 0.0–1.0 (mappe sur Q 0.5–10)
    // Coefficients biquad (pré-calculés).
    b0: f32, b1: f32, b2: f32,
    a1: f32, a2: f32,
    // État interne (registres de retard).
    x1: f32, x2: f32,
    y1: f32, y2: f32,
}

impl Filter {
    pub fn new() -> Self {
        let mut f = Self {
            filter_type: FilterType::LowPass,
            cutoff: 8000.0,
            resonance: 0.0,
            b0: 1.0, b1: 0.0, b2: 0.0,
            a1: 0.0, a2: 0.0,
            x1: 0.0, x2: 0.0,
            y1: 0.0, y2: 0.0,
        };
        // Initialiser les coefficients pour 48 kHz par défaut.
        f.update_coefficients(48000);
        f
    }

    /// Recalcule les coefficients biquad selon le type, la coupure et la résonance.
    pub fn update_coefficients(&mut self, sample_rate: u32) {
        let sr = sample_rate as f32;
        // Limiter la coupure à sr/2 avec une marge pour éviter l'instabilité.
        let cutoff = self.cutoff.clamp(20.0, sr * 0.48);
        // Q : 0.5 (résonnance nulle) à 10.0 (forte résonnance).
        let q = 0.5 + self.resonance.clamp(0.0, 1.0) * 9.5;

        let w0 = 2.0 * std::f32::consts::PI * cutoff / sr;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);

        match self.filter_type {
            FilterType::LowPass => {
                let a0_inv = 1.0 / (1.0 + alpha);
                self.b0 = (1.0 - cos_w0) * 0.5 * a0_inv;
                self.b1 = (1.0 - cos_w0) * a0_inv;
                self.b2 = (1.0 - cos_w0) * 0.5 * a0_inv;
                self.a1 = -2.0 * cos_w0 * a0_inv;
                self.a2 = (1.0 - alpha) * a0_inv;
            }
            FilterType::HighPass => {
                let a0_inv = 1.0 / (1.0 + alpha);
                self.b0 = (1.0 + cos_w0) * 0.5 * a0_inv;
                self.b1 = -(1.0 + cos_w0) * a0_inv;
                self.b2 = (1.0 + cos_w0) * 0.5 * a0_inv;
                self.a1 = -2.0 * cos_w0 * a0_inv;
                self.a2 = (1.0 - alpha) * a0_inv;
            }
            FilterType::BandPass => {
                let a0_inv = 1.0 / (1.0 + alpha);
                self.b0 = sin_w0 * 0.5 * a0_inv;
                self.b1 = 0.0;
                self.b2 = -sin_w0 * 0.5 * a0_inv;
                self.a1 = -2.0 * cos_w0 * a0_inv;
                self.a2 = (1.0 - alpha) * a0_inv;
            }
        }
    }

    /// Traite un échantillon et retourne le résultat filtré.
    pub fn process(&mut self, input: f32) -> f32 {
        let out = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = out;
        out
    }

    /// Remet les registres à zéro (utilisé au déclenchement d'une nouvelle voix).
    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lowpass_attenuates_high_freq() {
        // Filtre passe-bas 1 kHz : une sinusoïde à 10 kHz doit être fortement atténuée.
        let mut f = Filter::new();
        f.cutoff = 1000.0;
        f.resonance = 0.0;
        f.update_coefficients(48000);

        // Générer 1000 échantillons d'une sinus à 10 kHz.
        let mut max_out = 0.0f32;
        for i in 0..1000 {
            let t = i as f32 / 48000.0;
            let input = (2.0 * std::f32::consts::PI * 10000.0 * t).sin();
            let out = f.process(input);
            // Ignorer les premiers échantillons (transitoire).
            if i > 100 { max_out = max_out.max(out.abs()); }
        }
        assert!(max_out < 0.1, "Le filtre n'atténue pas assez à 10 kHz : {max_out}");
    }

    #[test]
    fn test_lowpass_passes_low_freq() {
        // Filtre passe-bas 8 kHz : une sinusoïde à 100 Hz doit passer quasi-intacte.
        let mut f = Filter::new();
        f.cutoff = 8000.0;
        f.resonance = 0.0;
        f.update_coefficients(48000);

        let mut max_out = 0.0f32;
        for i in 0..10000 {
            let t = i as f32 / 48000.0;
            let input = (2.0 * std::f32::consts::PI * 100.0 * t).sin();
            let out = f.process(input);
            if i > 1000 { max_out = max_out.max(out.abs()); }
        }
        assert!(max_out > 0.9, "Le filtre atténue trop à 100 Hz : {max_out}");
    }
}
