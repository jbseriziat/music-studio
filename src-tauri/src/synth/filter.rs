use serde::{Deserialize, Serialize};

/// Type de filtre.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum FilterType {
    LowPass,    // 12 dB/oct (original)
    LowPass24,  // 24 dB/oct (deux biquads en cascade) — Phase 5
    HighPass,
    BandPass,
    Notch,      // Phase 5
}

impl Default for FilterType {
    fn default() -> Self {
        FilterType::LowPass
    }
}

impl FilterType {
    pub fn from_index(i: u32) -> Self {
        match i {
            0 => Self::LowPass,
            1 => Self::LowPass24,
            2 => Self::HighPass,
            3 => Self::BandPass,
            4 => Self::Notch,
            _ => Self::LowPass,
        }
    }

    pub fn to_index(&self) -> u32 {
        match self {
            Self::LowPass => 0,
            Self::LowPass24 => 1,
            Self::HighPass => 2,
            Self::BandPass => 3,
            Self::Notch => 4,
        }
    }
}

/// Filtre biquad IIR (2 pôles, 2 zéros).
/// Phase 5 : LowPass24 = cascade de 2 biquads, drive = saturation tanh.
#[derive(Debug, Clone)]
pub struct Filter {
    pub filter_type: FilterType,
    pub cutoff: f32,     // Hz, 20–20000
    pub resonance: f32,  // 0.0–1.0 (mappe sur Q 0.5–10)
    /// Drive/saturation avant le filtre (0.0–1.0). Phase 5.
    pub drive: f32,
    // Coefficients biquad.
    b0: f32, b1: f32, b2: f32,
    a1: f32, a2: f32,
    // État interne — stage 1.
    x1: f32, x2: f32,
    y1: f32, y2: f32,
    // État interne — stage 2 (LowPass24).
    x1b: f32, x2b: f32,
    y1b: f32, y2b: f32,
}

impl Filter {
    pub fn new() -> Self {
        let mut f = Self {
            filter_type: FilterType::LowPass,
            cutoff: 8000.0,
            resonance: 0.0,
            drive: 0.0,
            b0: 1.0, b1: 0.0, b2: 0.0,
            a1: 0.0, a2: 0.0,
            x1: 0.0, x2: 0.0,
            y1: 0.0, y2: 0.0,
            x1b: 0.0, x2b: 0.0,
            y1b: 0.0, y2b: 0.0,
        };
        f.update_coefficients(48000);
        f
    }

    /// Recalcule les coefficients biquad.
    pub fn update_coefficients(&mut self, sample_rate: u32) {
        let sr = sample_rate as f32;
        let cutoff = self.cutoff.clamp(20.0, sr * 0.48);
        let q = 0.5 + self.resonance.clamp(0.0, 1.0) * 9.5;

        let w0 = 2.0 * std::f32::consts::PI * cutoff / sr;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);

        match self.filter_type {
            FilterType::LowPass | FilterType::LowPass24 => {
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
            FilterType::Notch => {
                let a0_inv = 1.0 / (1.0 + alpha);
                self.b0 = a0_inv;
                self.b1 = -2.0 * cos_w0 * a0_inv;
                self.b2 = a0_inv;
                self.a1 = -2.0 * cos_w0 * a0_inv;
                self.a2 = (1.0 - alpha) * a0_inv;
            }
        }
    }

    /// Traite un échantillon.
    pub fn process(&mut self, input: f32) -> f32 {
        // Drive : saturation douce avant le filtre.
        let driven = if self.drive > 0.001 {
            let gain = 1.0 + self.drive * 4.0;
            soft_clip(input * gain)
        } else {
            input
        };

        // Stage 1.
        let out1 = self.b0 * driven + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = driven;
        self.y2 = self.y1;
        self.y1 = out1;

        // Stage 2 pour LowPass24.
        if self.filter_type == FilterType::LowPass24 {
            let out2 = self.b0 * out1 + self.b1 * self.x1b + self.b2 * self.x2b
                - self.a1 * self.y1b - self.a2 * self.y2b;
            self.x2b = self.x1b;
            self.x1b = out1;
            self.y2b = self.y1b;
            self.y1b = out2;
            out2
        } else {
            out1
        }
    }

    /// Remet les registres à zéro.
    pub fn reset(&mut self) {
        self.x1 = 0.0; self.x2 = 0.0;
        self.y1 = 0.0; self.y2 = 0.0;
        self.x1b = 0.0; self.x2b = 0.0;
        self.y1b = 0.0; self.y2b = 0.0;
    }
}

/// Saturation douce (approximation rapide de tanh).
#[inline]
fn soft_clip(x: f32) -> f32 {
    if x > 1.5 { 1.0 } else if x < -1.5 { -1.0 } else { x - (x * x * x) / 4.5 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lowpass_attenuates_high_freq() {
        let mut f = Filter::new();
        f.cutoff = 1000.0;
        f.update_coefficients(48000);
        let mut max_out = 0.0f32;
        for i in 0..1000 {
            let t = i as f32 / 48000.0;
            let input = (2.0 * std::f32::consts::PI * 10000.0 * t).sin();
            let out = f.process(input);
            if i > 100 { max_out = max_out.max(out.abs()); }
        }
        assert!(max_out < 0.1, "LP n'atténue pas assez à 10 kHz : {max_out}");
    }

    #[test]
    fn test_lowpass_passes_low_freq() {
        let mut f = Filter::new();
        f.cutoff = 8000.0;
        f.update_coefficients(48000);
        let mut max_out = 0.0f32;
        for i in 0..10000 {
            let t = i as f32 / 48000.0;
            let input = (2.0 * std::f32::consts::PI * 100.0 * t).sin();
            let out = f.process(input);
            if i > 1000 { max_out = max_out.max(out.abs()); }
        }
        assert!(max_out > 0.9, "LP atténue trop à 100 Hz : {max_out}");
    }

    #[test]
    fn test_lowpass24_steeper() {
        let mut f12 = Filter::new();
        f12.cutoff = 1000.0;
        f12.update_coefficients(48000);
        let mut f24 = Filter::new();
        f24.filter_type = FilterType::LowPass24;
        f24.cutoff = 1000.0;
        f24.update_coefficients(48000);
        let mut m12 = 0.0f32;
        let mut m24 = 0.0f32;
        for i in 0..2000 {
            let t = i as f32 / 48000.0;
            let inp = (2.0 * std::f32::consts::PI * 8000.0 * t).sin();
            if i > 200 { m12 = m12.max(f12.process(inp).abs()); m24 = m24.max(f24.process(inp).abs()); }
            else { f12.process(inp); f24.process(inp); }
        }
        assert!(m24 < m12, "LP24 doit atténuer plus que LP12");
    }

    #[test]
    fn test_notch_attenuates_center() {
        let mut f = Filter::new();
        f.filter_type = FilterType::Notch;
        f.cutoff = 1000.0;
        f.resonance = 0.5;
        f.update_coefficients(48000);
        let mut max_out = 0.0f32;
        for i in 0..4000 {
            let t = i as f32 / 48000.0;
            let inp = (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
            let out = f.process(inp);
            if i > 500 { max_out = max_out.max(out.abs()); }
        }
        assert!(max_out < 0.3, "Notch doit atténuer : {max_out}");
    }
}
