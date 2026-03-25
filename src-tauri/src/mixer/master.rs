use crate::effects::limiter::BrickwallLimiter;
use super::lufs_meter::LufsMeter;

/// EQ biquad shelf/peak band.
#[derive(Debug, Clone)]
struct EqBand {
    gain_db: f32,
    freq: f32,
    q: f32,
    band_type: BandType,
    // Coefficients biquad (L et R partagent les mêmes coefficients)
    b0: f32, b1: f32, b2: f32, a1: f32, a2: f32,
    // État L
    x1l: f32, x2l: f32, y1l: f32, y2l: f32,
    // État R
    x1r: f32, x2r: f32, y1r: f32, y2r: f32,
}

#[derive(Debug, Clone, Copy)]
enum BandType {
    LowShelf,
    Peak,
    HighShelf,
}

impl EqBand {
    fn new(band_type: BandType, freq: f32, q: f32) -> Self {
        let mut b = Self {
            gain_db: 0.0, freq, q, band_type,
            b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0,
            x1l: 0.0, x2l: 0.0, y1l: 0.0, y2l: 0.0,
            x1r: 0.0, x2r: 0.0, y1r: 0.0, y2r: 0.0,
        };
        b.update_coefficients(48000);
        b
    }

    fn update_coefficients(&mut self, sample_rate: u32) {
        let sr = sample_rate as f32;
        let freq = self.freq.clamp(20.0, sr * 0.48);
        let a = 10.0f32.powf(self.gain_db / 40.0); // √(10^(dB/20))
        let w0 = 2.0 * std::f32::consts::PI * freq / sr;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * self.q.max(0.1));

        match self.band_type {
            BandType::LowShelf => {
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a0_inv = 1.0 / a0;
                self.b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha) * a0_inv;
                self.b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0) * a0_inv;
                self.b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha) * a0_inv;
                self.a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0) * a0_inv;
                self.a2 = ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha) * a0_inv;
            }
            BandType::HighShelf => {
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a0_inv = 1.0 / a0;
                self.b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha) * a0_inv;
                self.b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0) * a0_inv;
                self.b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha) * a0_inv;
                self.a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0) * a0_inv;
                self.a2 = ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha) * a0_inv;
            }
            BandType::Peak => {
                let a0 = 1.0 + alpha / a;
                let a0_inv = 1.0 / a0;
                self.b0 = (1.0 + alpha * a) * a0_inv;
                self.b1 = -2.0 * cos_w0 * a0_inv;
                self.b2 = (1.0 - alpha * a) * a0_inv;
                self.a1 = -2.0 * cos_w0 * a0_inv;
                self.a2 = (1.0 - alpha / a) * a0_inv;
            }
        }
    }

    fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let ol = self.b0 * l + self.b1 * self.x1l + self.b2 * self.x2l
            - self.a1 * self.y1l - self.a2 * self.y2l;
        self.x2l = self.x1l; self.x1l = l;
        self.y2l = self.y1l; self.y1l = ol;

        let or = self.b0 * r + self.b1 * self.x1r + self.b2 * self.x2r
            - self.a1 * self.y1r - self.a2 * self.y2r;
        self.x2r = self.x1r; self.x1r = r;
        self.y2r = self.y1r; self.y1r = or;

        (ol, or)
    }

    fn reset(&mut self) {
        self.x1l = 0.0; self.x2l = 0.0; self.y1l = 0.0; self.y2l = 0.0;
        self.x1r = 0.0; self.x2r = 0.0; self.y1r = 0.0; self.y2r = 0.0;
    }
}

/// EQ Master 5 bandes : Low Shelf, Low-Mid Peak, Mid Peak, High-Mid Peak, High Shelf.
#[derive(Debug)]
pub struct MasterEq {
    bands: [EqBand; 5],
    sample_rate: u32,
}

impl MasterEq {
    pub fn new(sample_rate: u32) -> Self {
        let mut eq = Self {
            bands: [
                EqBand::new(BandType::LowShelf,  80.0, 0.7),
                EqBand::new(BandType::Peak,      300.0, 1.0),
                EqBand::new(BandType::Peak,     1000.0, 1.0),
                EqBand::new(BandType::Peak,     4000.0, 1.0),
                EqBand::new(BandType::HighShelf, 12000.0, 0.7),
            ],
            sample_rate,
        };
        for b in &mut eq.bands {
            b.update_coefficients(sample_rate);
        }
        eq
    }

    pub fn set_band(&mut self, band_idx: u8, gain_db: f32, freq: f32, q: f32) {
        let idx = band_idx as usize;
        if idx >= 5 { return; }
        self.bands[idx].gain_db = gain_db.clamp(-12.0, 12.0);
        self.bands[idx].freq = freq.clamp(20.0, 20000.0);
        self.bands[idx].q = q.clamp(0.1, 10.0);
        self.bands[idx].update_coefficients(self.sample_rate);
    }

    pub fn get_band(&self, band_idx: u8) -> (f32, f32, f32) {
        let idx = band_idx as usize;
        if idx >= 5 { return (0.0, 1000.0, 1.0); }
        (self.bands[idx].gain_db, self.bands[idx].freq, self.bands[idx].q)
    }

    pub fn process(&mut self, mut l: f32, mut r: f32) -> (f32, f32) {
        for band in &mut self.bands {
            let (nl, nr) = band.process(l, r);
            l = nl;
            r = nr;
        }
        (l, r)
    }

    pub fn reset(&mut self) {
        for b in &mut self.bands { b.reset(); }
    }
}

// ── Spectrum FFT (simple DFT pour 64 bins, pas de dépendance externe) ────────

/// Ring buffer des derniers 1024 samples mono (L+R)/2 pour l'analyse spectrale.
const SPECTRUM_BUFFER_SIZE: usize = 1024;
const SPECTRUM_BINS: usize = 64;

#[derive(Debug)]
pub struct SpectrumAnalyzer {
    buffer: [f32; SPECTRUM_BUFFER_SIZE],
    write_idx: usize,
    /// Résultat de la dernière FFT (64 bins, magnitude en dB).
    pub bins: [f32; SPECTRUM_BINS],
    /// Compteur de samples depuis le dernier calcul FFT.
    sample_count: u32,
    /// Intervalle de calcul en samples (~50ms).
    compute_interval: u32,
}

impl SpectrumAnalyzer {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            buffer: [0.0; SPECTRUM_BUFFER_SIZE],
            write_idx: 0,
            bins: [-70.0; SPECTRUM_BINS],
            sample_count: 0,
            compute_interval: sample_rate / 20, // ~50ms
        }
    }

    /// Pousse un sample mono dans le ring buffer.
    pub fn push(&mut self, sample: f32) {
        self.buffer[self.write_idx] = sample;
        self.write_idx = (self.write_idx + 1) % SPECTRUM_BUFFER_SIZE;
        self.sample_count += 1;
        if self.sample_count >= self.compute_interval {
            self.sample_count = 0;
            self.compute();
        }
    }

    /// Calcule le spectre via DFT simplifiée (64 bins couvrant 0–Nyquist).
    /// Ce n'est PAS une FFT optimale mais suffisant pour 64 bins de visualisation.
    fn compute(&mut self) {
        let n = SPECTRUM_BUFFER_SIZE;
        // Appliquer une fenêtre de Hann et calculer DFT pour 64 bins.
        for k in 0..SPECTRUM_BINS {
            let freq_idx = k * (n / 2) / SPECTRUM_BINS; // bin de fréquence
            let mut re = 0.0f64;
            let mut im = 0.0f64;
            for i in 0..n {
                let idx = (self.write_idx + i) % n;
                // Fenêtre de Hann.
                let w = 0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / n as f64).cos());
                let x = self.buffer[idx] as f64 * w;
                let angle = 2.0 * std::f64::consts::PI * freq_idx as f64 * i as f64 / n as f64;
                re += x * angle.cos();
                im -= x * angle.sin();
            }
            let magnitude = (re * re + im * im).sqrt() / (n as f64 * 0.5);
            // Convertir en dB, clamper à -70 dB.
            self.bins[k] = if magnitude > 0.0 {
                (20.0 * magnitude.log10()).max(-70.0) as f32
            } else {
                -70.0
            };
        }
    }
}

// ── MasterChain ──────────────────────────────────────────────────────────────

/// Chaîne de mastering : EQ → Limiter, avec LUFS meter et analyseur de spectre.
#[derive(Debug)]
pub struct MasterChain {
    pub eq: MasterEq,
    pub limiter: BrickwallLimiter,
    pub lufs_meter: LufsMeter,
    pub spectrum: SpectrumAnalyzer,
    pub enabled: bool,
    pub eq_enabled: bool,
}

impl MasterChain {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            eq: MasterEq::new(sample_rate),
            limiter: BrickwallLimiter::new(sample_rate),
            lufs_meter: LufsMeter::new(sample_rate),
            spectrum: SpectrumAnalyzer::new(sample_rate),
            enabled: false,
            eq_enabled: true,
        }
    }

    /// Traite une frame stéréo : EQ → Limiter. Met à jour le LUFS meter et le spectre.
    pub fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        if !self.enabled {
            // Même si désactivée, on alimente les meters pour le monitoring.
            self.lufs_meter.process(l, r);
            self.spectrum.push((l + r) * 0.5);
            return (l, r);
        }

        // EQ.
        let (eq_l, eq_r) = if self.eq_enabled {
            self.eq.process(l, r)
        } else {
            (l, r)
        };

        // Limiter.
        let (lim_l, lim_r) = self.limiter.process(eq_l, eq_r);

        // LUFS meter (post-limiter).
        self.lufs_meter.process(lim_l, lim_r);

        // Spectrum (post-EQ, pre-limiter pour mieux visualiser l'EQ).
        self.spectrum.push((eq_l + eq_r) * 0.5);

        (lim_l, lim_r)
    }

    pub fn reset(&mut self) {
        self.eq.reset();
        self.limiter.reset();
        self.lufs_meter.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eq_flat_passthrough() {
        let mut eq = MasterEq::new(48000);
        // All bands at 0 dB → passthrough.
        let mut max_diff = 0.0f32;
        for i in 0..10000 {
            let t = i as f32 / 48000.0;
            let inp = (2.0 * std::f32::consts::PI * 440.0 * t).sin();
            let (l, _) = eq.process(inp, inp);
            if i > 500 { max_diff = max_diff.max((l - inp).abs()); }
        }
        assert!(max_diff < 0.001, "EQ flat should passthrough: diff={max_diff}");
    }

    #[test]
    fn test_eq_boost_increases_level() {
        let mut eq = MasterEq::new(48000);
        eq.set_band(2, 6.0, 1000.0, 1.0); // +6 dB at 1kHz
        let mut max_out = 0.0f32;
        for i in 0..10000 {
            let t = i as f32 / 48000.0;
            let inp = (2.0 * std::f32::consts::PI * 1000.0 * t).sin() * 0.5;
            let (l, _) = eq.process(inp, inp);
            if i > 500 { max_out = max_out.max(l.abs()); }
        }
        assert!(max_out > 0.6, "EQ boost should increase level: {max_out}");
    }

    #[test]
    fn test_master_chain_passthrough_when_disabled() {
        let mut chain = MasterChain::new(48000);
        chain.enabled = false;
        let (l, r) = chain.process(0.7, -0.3);
        assert!((l - 0.7).abs() < 0.001);
        assert!((r + 0.3).abs() < 0.001);
    }

    #[test]
    fn test_master_chain_limits_when_enabled() {
        let mut chain = MasterChain::new(48000);
        chain.enabled = true;
        chain.limiter.set_threshold_db(-6.0);
        for _ in 0..1000 {
            let (l, r) = chain.process(1.0, -1.0);
            assert!(l.abs() <= chain.limiter.threshold + 0.01, "L: {l}");
            assert!(r.abs() <= chain.limiter.threshold + 0.01, "R: {r}");
        }
    }
}
