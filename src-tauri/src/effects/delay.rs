use super::Effect;

/// Durée maximale du delay (2 secondes à 48 kHz).
const MAX_DELAY_SAMPLES: usize = 96_001;

/// Delay stéréo avec buffer circulaire et filtre LP dans la boucle de feedback.
pub struct Delay {
    buffer_l: Vec<f32>,
    buffer_r: Vec<f32>,
    write_pos: usize,
    delay_samples: usize,
    feedback: f32,
    wet: f32,
    dry: f32,
    /// Coefficient du filtre LP dans le feedback (0 = transparent, 1 = tout coupé).
    lp_coeff: f32,
    lp_state_l: f32,
    lp_state_r: f32,
    time_ms: f32,
    sample_rate: u32,
}

impl Delay {
    pub fn new(sample_rate: u32) -> Self {
        // Par défaut : 375 ms (≈ croche à 120 BPM).
        let time_ms = 375.0f32;
        let delay_samples = Self::ms_to_samples(time_ms, sample_rate);
        Self {
            buffer_l: vec![0.0f32; MAX_DELAY_SAMPLES],
            buffer_r: vec![0.0f32; MAX_DELAY_SAMPLES],
            write_pos: 0,
            delay_samples,
            feedback: 0.4,
            wet: 0.3,
            dry: 1.0,
            lp_coeff: 0.65, // filtre LP léger dans le feedback
            lp_state_l: 0.0,
            lp_state_r: 0.0,
            time_ms,
            sample_rate,
        }
    }

    fn ms_to_samples(time_ms: f32, sample_rate: u32) -> usize {
        ((time_ms / 1000.0) * sample_rate as f32) as usize
    }

    fn update_delay_samples(&mut self) {
        self.delay_samples =
            Self::ms_to_samples(self.time_ms, self.sample_rate).clamp(1, MAX_DELAY_SAMPLES - 1);
    }
}

impl Effect for Delay {
    fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        // Position de lecture dans le buffer circulaire.
        let read_pos =
            (self.write_pos + MAX_DELAY_SAMPLES - self.delay_samples) % MAX_DELAY_SAMPLES;

        // Lire la sortie différée.
        let delayed_l = self.buffer_l[read_pos];
        let delayed_r = self.buffer_r[read_pos];

        // Filtre LP dans le feedback (adoucit les répétitions).
        let lp = self.lp_coeff;
        let lp_inv = 1.0 - lp;
        self.lp_state_l = self.lp_state_l * lp + delayed_l * lp_inv;
        self.lp_state_r = self.lp_state_r * lp + delayed_r * lp_inv;

        // Écrire l'entrée + feedback filtré dans le buffer.
        self.buffer_l[self.write_pos] = input_l + self.lp_state_l * self.feedback;
        self.buffer_r[self.write_pos] = input_r + self.lp_state_r * self.feedback;

        // Avancer la position d'écriture.
        self.write_pos = (self.write_pos + 1) % MAX_DELAY_SAMPLES;

        // Sortie : dry + wet.
        (input_l * self.dry + delayed_l * self.wet, input_r * self.dry + delayed_r * self.wet)
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "time_ms" => {
                self.time_ms = value.clamp(10.0, 2000.0);
                self.update_delay_samples();
            }
            "feedback" => {
                self.feedback = value.clamp(0.0, 0.95);
            }
            "wet" => {
                self.wet = value.clamp(0.0, 1.0);
            }
            "dry" => {
                self.dry = value.clamp(0.0, 1.0);
            }
            _ => {}
        }
    }

    fn get_param(&self, name: &str) -> f32 {
        match name {
            "time_ms" => self.time_ms,
            "feedback" => self.feedback,
            "wet" => self.wet,
            "dry" => self.dry,
            _ => 0.0,
        }
    }

    fn get_all_params(&self) -> Vec<(String, f32)> {
        vec![
            ("time_ms".to_string(), self.time_ms),
            ("feedback".to_string(), self.feedback),
            ("wet".to_string(), self.wet),
            ("dry".to_string(), self.dry),
        ]
    }

    fn reset(&mut self) {
        self.buffer_l.iter_mut().for_each(|x| *x = 0.0);
        self.buffer_r.iter_mut().for_each(|x| *x = 0.0);
        self.write_pos = 0;
        self.lp_state_l = 0.0;
        self.lp_state_r = 0.0;
    }

    fn name(&self) -> &str {
        "Delay"
    }

    fn effect_type(&self) -> &str {
        "delay"
    }
}
