use std::f32::consts::PI;
use super::Effect;

/// Type de filtre biquad pour chaque bande EQ.
enum BandType {
    LowShelf,
    Peaking,
    HighShelf,
}

/// Filtre biquad stéréo avec coefficients pré-calculés (Audio EQ Cookbook).
/// Algorithme transposée-directe-II, état gardé séparément pour L et R.
struct BiquadFilter {
    band_type: BandType,
    /// Fréquence centrale / de coupure (Hz).
    pub freq: f32,
    /// Gain en dB (−12 à +12).
    pub gain_db: f32,
    /// Facteur de qualité Q.
    pub q: f32,
    sample_rate: u32,
    // Coefficients normalisés (b0, b1, b2 numérateur ; a1, a2 dénominateur divisés par a0).
    b0: f32, b1: f32, b2: f32, a1: f32, a2: f32,
    // État interne canal gauche.
    x1l: f32, x2l: f32, y1l: f32, y2l: f32,
    // État interne canal droit.
    x1r: f32, x2r: f32, y1r: f32, y2r: f32,
}

impl BiquadFilter {
    fn new(band_type: BandType, freq: f32, gain_db: f32, q: f32, sample_rate: u32) -> Self {
        let mut f = Self {
            band_type, freq, gain_db, q, sample_rate,
            b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0,
            x1l: 0.0, x2l: 0.0, y1l: 0.0, y2l: 0.0,
            x1r: 0.0, x2r: 0.0, y1r: 0.0, y2r: 0.0,
        };
        f.update_coeffs();
        f
    }

    /// Recalcule les coefficients biquad à partir de freq, gain_db, q.
    pub fn update_coeffs(&mut self) {
        let a = 10.0f32.powf(self.gain_db / 40.0); // amplitude (√ du gain puissance)
        let w0 = 2.0 * PI * self.freq / self.sample_rate as f32;
        let cos_w = w0.cos();
        let sin_w = w0.sin();
        let alpha = sin_w / (2.0 * self.q);
        let sqrt_a = a.sqrt();

        let (b0, b1, b2, a0, a1, a2) = match self.band_type {
            BandType::LowShelf => (
                a * ((a + 1.0) - (a - 1.0) * cos_w + 2.0 * sqrt_a * alpha),
                2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w),
                a * ((a + 1.0) - (a - 1.0) * cos_w - 2.0 * sqrt_a * alpha),
                (a + 1.0) + (a - 1.0) * cos_w + 2.0 * sqrt_a * alpha,
                -2.0 * ((a - 1.0) + (a + 1.0) * cos_w),
                (a + 1.0) + (a - 1.0) * cos_w - 2.0 * sqrt_a * alpha,
            ),
            BandType::Peaking => (
                1.0 + alpha * a,
                -2.0 * cos_w,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cos_w,
                1.0 - alpha / a,
            ),
            BandType::HighShelf => (
                a * ((a + 1.0) + (a - 1.0) * cos_w + 2.0 * sqrt_a * alpha),
                -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w),
                a * ((a + 1.0) + (a - 1.0) * cos_w - 2.0 * sqrt_a * alpha),
                (a + 1.0) - (a - 1.0) * cos_w + 2.0 * sqrt_a * alpha,
                2.0 * ((a - 1.0) - (a + 1.0) * cos_w),
                (a + 1.0) - (a - 1.0) * cos_w - 2.0 * sqrt_a * alpha,
            ),
        };

        // Normaliser par a0 pour obtenir la forme direct-II.
        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }

    /// Traite une frame stéréo (Direct-Form-II transposée).
    #[inline]
    fn process_sample(&mut self, il: f32, ir: f32) -> (f32, f32) {
        let ol = self.b0 * il + self.b1 * self.x1l + self.b2 * self.x2l
            - self.a1 * self.y1l - self.a2 * self.y2l;
        self.x2l = self.x1l; self.x1l = il;
        self.y2l = self.y1l; self.y1l = ol;

        let or_ = self.b0 * ir + self.b1 * self.x1r + self.b2 * self.x2r
            - self.a1 * self.y1r - self.a2 * self.y2r;
        self.x2r = self.x1r; self.x1r = ir;
        self.y2r = self.y1r; self.y1r = or_;

        (ol, or_)
    }

    fn reset(&mut self) {
        self.x1l = 0.0; self.x2l = 0.0; self.y1l = 0.0; self.y2l = 0.0;
        self.x1r = 0.0; self.x2r = 0.0; self.y1r = 0.0; self.y2r = 0.0;
    }
}

// ─── EQ 3 bandes ─────────────────────────────────────────────────────────────

/// Égaliseur paramétrique 3 bandes (Low shelf @ 200 Hz, Peaking @ 1 kHz, High shelf @ 5 kHz).
pub struct Eq {
    low:  BiquadFilter,
    mid:  BiquadFilter,
    high: BiquadFilter,
}

impl Eq {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            low:  BiquadFilter::new(BandType::LowShelf,  200.0,  0.0, 0.7, sample_rate),
            mid:  BiquadFilter::new(BandType::Peaking,  1000.0,  0.0, 1.0, sample_rate),
            high: BiquadFilter::new(BandType::HighShelf, 5000.0, 0.0, 0.7, sample_rate),
        }
    }
}

impl Effect for Eq {
    fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let (l, r) = self.low.process_sample(input_l, input_r);
        let (l, r) = self.mid.process_sample(l, r);
        self.high.process_sample(l, r)
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "low_gain"  => { self.low.gain_db  = value.clamp(-12.0, 12.0);  self.low.update_coeffs();  }
            "low_freq"  => { self.low.freq      = value.clamp(20.0, 2000.0); self.low.update_coeffs();  }
            "low_q"     => { self.low.q         = value.clamp(0.1, 10.0);   self.low.update_coeffs();  }
            "mid_gain"  => { self.mid.gain_db   = value.clamp(-12.0, 12.0); self.mid.update_coeffs();  }
            "mid_freq"  => { self.mid.freq       = value.clamp(200.0, 8000.0); self.mid.update_coeffs(); }
            "mid_q"     => { self.mid.q          = value.clamp(0.1, 10.0);  self.mid.update_coeffs();  }
            "high_gain" => { self.high.gain_db   = value.clamp(-12.0, 12.0); self.high.update_coeffs(); }
            "high_freq" => { self.high.freq       = value.clamp(1000.0, 20000.0); self.high.update_coeffs(); }
            "high_q"    => { self.high.q          = value.clamp(0.1, 10.0); self.high.update_coeffs(); }
            _ => {}
        }
    }

    fn get_param(&self, name: &str) -> f32 {
        match name {
            "low_gain"  => self.low.gain_db,
            "low_freq"  => self.low.freq,
            "low_q"     => self.low.q,
            "mid_gain"  => self.mid.gain_db,
            "mid_freq"  => self.mid.freq,
            "mid_q"     => self.mid.q,
            "high_gain" => self.high.gain_db,
            "high_freq" => self.high.freq,
            "high_q"    => self.high.q,
            _ => 0.0,
        }
    }

    fn get_all_params(&self) -> Vec<(String, f32)> {
        vec![
            ("low_gain".into(),  self.low.gain_db),
            ("low_freq".into(),  self.low.freq),
            ("low_q".into(),     self.low.q),
            ("mid_gain".into(),  self.mid.gain_db),
            ("mid_freq".into(),  self.mid.freq),
            ("mid_q".into(),     self.mid.q),
            ("high_gain".into(), self.high.gain_db),
            ("high_freq".into(), self.high.freq),
            ("high_q".into(),    self.high.q),
        ]
    }

    fn reset(&mut self) {
        self.low.reset();
        self.mid.reset();
        self.high.reset();
    }

    fn name(&self)        -> &str { "EQ" }
    fn effect_type(&self) -> &str { "eq" }
}
