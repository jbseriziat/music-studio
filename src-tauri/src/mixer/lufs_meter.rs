/// Mesure du volume perçu selon ITU-R BS.1770 (simplifié).
/// K-weighting = 2 filtres biquad en cascade, puis mesure RMS sur 3 fenêtres.
#[derive(Debug)]
pub struct LufsMeter {
    // K-weighting stage 1 (high-shelf) — état L/R
    ks1_x1l: f32, ks1_x2l: f32, ks1_y1l: f32, ks1_y2l: f32,
    ks1_x1r: f32, ks1_x2r: f32, ks1_y1r: f32, ks1_y2r: f32,
    ks1_b0: f32, ks1_b1: f32, ks1_b2: f32, ks1_a1: f32, ks1_a2: f32,
    // K-weighting stage 2 (high-pass) — état L/R
    ks2_x1l: f32, ks2_x2l: f32, ks2_y1l: f32, ks2_y2l: f32,
    ks2_x1r: f32, ks2_x2r: f32, ks2_y1r: f32, ks2_y2r: f32,
    ks2_b0: f32, ks2_b1: f32, ks2_b2: f32, ks2_a1: f32, ks2_a2: f32,
    // Ring buffers pour les fenêtres temporelles (somme de power par block de 100ms)
    /// Fenêtre 400ms = 4 blocks de 100ms.
    momentary_blocks: [f64; 4],
    /// Fenêtre 3s = 30 blocks de 100ms.
    shortterm_blocks: [f64; 30],
    /// Index d'écriture dans les ring buffers.
    block_write_idx: usize,
    /// Accumulateur pour le block courant (100ms).
    block_power_sum: f64,
    block_sample_count: u32,
    block_target_samples: u32, // = sample_rate / 10
    /// Integrated (tout le morceau).
    integrated_sum: f64,
    integrated_blocks: u64,
    /// True peak (max absolu non filtré).
    true_peak: f32,
    sample_rate: u32,
}

impl LufsMeter {
    pub fn new(sample_rate: u32) -> Self {
        // Coefficients K-weighting pour 48000 Hz (ITU-R BS.1770-4).
        // Stage 1 : high shelf (+4 dB à haute fréquence).
        let (b0_1, b1_1, b2_1, a1_1, a2_1) = if sample_rate == 44100 {
            (1.5308412300503478, -2.6509799951547297, 1.1690790799215869,
             -1.6636551132560204, 0.7125954280732254)
        } else {
            // 48000 Hz (standard)
            (1.53512485958697, -2.69169618940638, 1.19839281085285,
             -1.69065929318241, 0.73248077421585)
        };
        // Stage 2 : high-pass (filtre les basses < 60 Hz).
        let (b0_2, b1_2, b2_2, a1_2, a2_2) = if sample_rate == 44100 {
            (1.0, -2.0, 1.0,
             -1.9900474920801990, 0.9900968867902419)
        } else {
            (1.0, -2.0, 1.0,
             -1.99004745483398, 0.99007225036621)
        };

        Self {
            ks1_x1l: 0.0, ks1_x2l: 0.0, ks1_y1l: 0.0, ks1_y2l: 0.0,
            ks1_x1r: 0.0, ks1_x2r: 0.0, ks1_y1r: 0.0, ks1_y2r: 0.0,
            ks1_b0: b0_1, ks1_b1: b1_1, ks1_b2: b2_1, ks1_a1: a1_1, ks1_a2: a2_1,
            ks2_x1l: 0.0, ks2_x2l: 0.0, ks2_y1l: 0.0, ks2_y2l: 0.0,
            ks2_x1r: 0.0, ks2_x2r: 0.0, ks2_y1r: 0.0, ks2_y2r: 0.0,
            ks2_b0: b0_2, ks2_b1: b1_2, ks2_b2: b2_2, ks2_a1: a1_2, ks2_a2: a2_2,
            momentary_blocks: [0.0; 4],
            shortterm_blocks: [0.0; 30],
            block_write_idx: 0,
            block_power_sum: 0.0,
            block_sample_count: 0,
            block_target_samples: sample_rate / 10,
            integrated_sum: 0.0,
            integrated_blocks: 0,
            true_peak: 0.0,
            sample_rate,
        }
    }

    /// Traite une frame stéréo. Appelé pour chaque échantillon du signal master.
    pub fn process(&mut self, input_l: f32, input_r: f32) {
        // True peak (non filtré).
        let tp = input_l.abs().max(input_r.abs());
        if tp > self.true_peak { self.true_peak = tp; }

        // K-weighting stage 1 (left).
        let s1l = self.ks1_b0 * input_l + self.ks1_b1 * self.ks1_x1l + self.ks1_b2 * self.ks1_x2l
            - self.ks1_a1 * self.ks1_y1l - self.ks1_a2 * self.ks1_y2l;
        self.ks1_x2l = self.ks1_x1l; self.ks1_x1l = input_l;
        self.ks1_y2l = self.ks1_y1l; self.ks1_y1l = s1l;
        // K-weighting stage 1 (right).
        let s1r = self.ks1_b0 * input_r + self.ks1_b1 * self.ks1_x1r + self.ks1_b2 * self.ks1_x2r
            - self.ks1_a1 * self.ks1_y1r - self.ks1_a2 * self.ks1_y2r;
        self.ks1_x2r = self.ks1_x1r; self.ks1_x1r = input_r;
        self.ks1_y2r = self.ks1_y1r; self.ks1_y1r = s1r;

        // K-weighting stage 2 (left).
        let s2l = self.ks2_b0 * s1l + self.ks2_b1 * self.ks2_x1l + self.ks2_b2 * self.ks2_x2l
            - self.ks2_a1 * self.ks2_y1l - self.ks2_a2 * self.ks2_y2l;
        self.ks2_x2l = self.ks2_x1l; self.ks2_x1l = s1l;
        self.ks2_y2l = self.ks2_y1l; self.ks2_y1l = s2l;
        // K-weighting stage 2 (right).
        let s2r = self.ks2_b0 * s1r + self.ks2_b1 * self.ks2_x1r + self.ks2_b2 * self.ks2_x2r
            - self.ks2_a1 * self.ks2_y1r - self.ks2_a2 * self.ks2_y2r;
        self.ks2_x2r = self.ks2_x1r; self.ks2_x1r = s1r;
        self.ks2_y2r = self.ks2_y1r; self.ks2_y1r = s2r;

        // Somme de puissance (pondérée L=1.0, R=1.0 pour front stereo).
        self.block_power_sum += (s2l * s2l + s2r * s2r) as f64;
        self.block_sample_count += 1;

        // Fin de block 100ms → stocker la puissance moyenne.
        if self.block_sample_count >= self.block_target_samples {
            let mean_power = self.block_power_sum / self.block_sample_count as f64;
            let idx = self.block_write_idx;
            self.momentary_blocks[idx % 4] = mean_power;
            self.shortterm_blocks[idx % 30] = mean_power;
            self.integrated_sum += mean_power;
            self.integrated_blocks += 1;
            self.block_write_idx = idx.wrapping_add(1);
            self.block_power_sum = 0.0;
            self.block_sample_count = 0;
        }
    }

    /// Momentary LUFS (fenêtre 400ms = 4 blocks).
    pub fn get_momentary(&self) -> f32 {
        let filled = self.block_write_idx.min(4);
        if filled == 0 { return -70.0; }
        let sum: f64 = self.momentary_blocks.iter().take(4).sum();
        let mean = sum / filled as f64;
        power_to_lufs(mean)
    }

    /// Short-term LUFS (fenêtre 3s = 30 blocks).
    pub fn get_shortterm(&self) -> f32 {
        let filled = self.block_write_idx.min(30);
        if filled == 0 { return -70.0; }
        let sum: f64 = self.shortterm_blocks.iter().take(30).sum();
        let mean = sum / filled as f64;
        power_to_lufs(mean)
    }

    /// Integrated LUFS (tout le morceau).
    pub fn get_integrated(&self) -> f32 {
        if self.integrated_blocks == 0 { return -70.0; }
        let mean = self.integrated_sum / self.integrated_blocks as f64;
        power_to_lufs(mean)
    }

    /// True peak en dBFS.
    pub fn get_true_peak_db(&self) -> f32 {
        if self.true_peak <= 0.0 { -70.0 } else { 20.0 * self.true_peak.log10() }
    }

    pub fn reset(&mut self) {
        self.momentary_blocks = [0.0; 4];
        self.shortterm_blocks = [0.0; 30];
        self.block_write_idx = 0;
        self.block_power_sum = 0.0;
        self.block_sample_count = 0;
        self.integrated_sum = 0.0;
        self.integrated_blocks = 0;
        self.true_peak = 0.0;
        // Reset filter states
        self.ks1_x1l = 0.0; self.ks1_x2l = 0.0; self.ks1_y1l = 0.0; self.ks1_y2l = 0.0;
        self.ks1_x1r = 0.0; self.ks1_x2r = 0.0; self.ks1_y1r = 0.0; self.ks1_y2r = 0.0;
        self.ks2_x1l = 0.0; self.ks2_x2l = 0.0; self.ks2_y1l = 0.0; self.ks2_y2l = 0.0;
        self.ks2_x1r = 0.0; self.ks2_x2r = 0.0; self.ks2_y1r = 0.0; self.ks2_y2r = 0.0;
    }
}

fn power_to_lufs(mean_power: f64) -> f32 {
    if mean_power <= 0.0 { -70.0 } else { (-0.691 + 10.0 * mean_power.log10()) as f32 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_silence_gives_low_lufs() {
        let mut m = LufsMeter::new(48000);
        for _ in 0..48000 { m.process(0.0, 0.0); }
        assert!(m.get_momentary() < -60.0);
        assert!(m.get_integrated() < -60.0);
    }

    #[test]
    fn test_loud_signal_high_lufs() {
        let mut m = LufsMeter::new(48000);
        // 1 second of full-scale sine
        for i in 0..48000u32 {
            let t = i as f32 / 48000.0;
            let s = (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
            m.process(s, s);
        }
        let lufs = m.get_momentary();
        // Full-scale sine should be around -3 to 0 LUFS
        assert!(lufs > -10.0, "Full-scale sine LUFS too low: {lufs}");
    }

    #[test]
    fn test_true_peak() {
        let mut m = LufsMeter::new(48000);
        m.process(0.8, -0.9);
        assert!((m.true_peak - 0.9).abs() < 0.01);
    }
}
