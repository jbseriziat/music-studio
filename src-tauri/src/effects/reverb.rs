use super::Effect;

// Longueurs des filtres comb à 48 kHz (algorithme Freeverb).
const COMB_LENGTHS: [usize; 8] = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
// Longueurs des filtres allpass.
const ALLPASS_LENGTHS: [usize; 4] = [225, 556, 441, 341];
// Décalage stéréo : +23 samples pour le canal droit.
const STEREO_SPREAD: usize = 23;

// ─── Comb Filter (LBCF — Lowpass-feedback Comb Filter) ───────────────────────
struct CombFilter {
    buffer: Vec<f32>,
    pos: usize,
    feedback: f32,
    damp1: f32, // = damping (absorption HF dans le feedback)
    damp2: f32, // = 1.0 - damp1 (pour éviter le recalcul)
    filterstore: f32,
}

impl CombFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0f32; size],
            pos: 0,
            feedback: 0.7,
            damp1: 0.5,
            damp2: 0.5,
            filterstore: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let output = self.buffer[self.pos];
        // Filtre LP dans la boucle de feedback (Freeverb original).
        self.filterstore = output * self.damp2 + self.filterstore * self.damp1;
        self.buffer[self.pos] = input + self.filterstore * self.feedback;
        self.pos = (self.pos + 1) % self.buffer.len();
        output
    }

    fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback;
    }

    fn set_damping(&mut self, damping: f32) {
        self.damp1 = damping;
        self.damp2 = 1.0 - damping;
    }

    fn clear(&mut self) {
        self.buffer.iter_mut().for_each(|x| *x = 0.0);
        self.filterstore = 0.0;
        self.pos = 0;
    }
}

// ─── Allpass Filter ───────────────────────────────────────────────────────────
struct AllpassFilter {
    buffer: Vec<f32>,
    pos: usize,
}

impl AllpassFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0f32; size],
            pos: 0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        const FEEDBACK: f32 = 0.5;
        let buf_out = self.buffer[self.pos];
        let output = -input + buf_out;
        self.buffer[self.pos] = input + buf_out * FEEDBACK;
        self.pos = (self.pos + 1) % self.buffer.len();
        output
    }

    fn clear(&mut self) {
        self.buffer.iter_mut().for_each(|x| *x = 0.0);
        self.pos = 0;
    }
}

// ─── Reverb (Freeverb stéréo) ─────────────────────────────────────────────────
pub struct Reverb {
    combs_l: [CombFilter; 8],
    combs_r: [CombFilter; 8],
    allpasses_l: [AllpassFilter; 4],
    allpasses_r: [AllpassFilter; 4],
    room_size: f32,
    damping: f32,
    wet: f32,
    dry: f32,
}

impl Reverb {
    pub fn new() -> Self {
        let mut rev = Self {
            combs_l: [
                CombFilter::new(COMB_LENGTHS[0]),
                CombFilter::new(COMB_LENGTHS[1]),
                CombFilter::new(COMB_LENGTHS[2]),
                CombFilter::new(COMB_LENGTHS[3]),
                CombFilter::new(COMB_LENGTHS[4]),
                CombFilter::new(COMB_LENGTHS[5]),
                CombFilter::new(COMB_LENGTHS[6]),
                CombFilter::new(COMB_LENGTHS[7]),
            ],
            combs_r: [
                CombFilter::new(COMB_LENGTHS[0] + STEREO_SPREAD),
                CombFilter::new(COMB_LENGTHS[1] + STEREO_SPREAD),
                CombFilter::new(COMB_LENGTHS[2] + STEREO_SPREAD),
                CombFilter::new(COMB_LENGTHS[3] + STEREO_SPREAD),
                CombFilter::new(COMB_LENGTHS[4] + STEREO_SPREAD),
                CombFilter::new(COMB_LENGTHS[5] + STEREO_SPREAD),
                CombFilter::new(COMB_LENGTHS[6] + STEREO_SPREAD),
                CombFilter::new(COMB_LENGTHS[7] + STEREO_SPREAD),
            ],
            allpasses_l: [
                AllpassFilter::new(ALLPASS_LENGTHS[0]),
                AllpassFilter::new(ALLPASS_LENGTHS[1]),
                AllpassFilter::new(ALLPASS_LENGTHS[2]),
                AllpassFilter::new(ALLPASS_LENGTHS[3]),
            ],
            allpasses_r: [
                AllpassFilter::new(ALLPASS_LENGTHS[0] + STEREO_SPREAD),
                AllpassFilter::new(ALLPASS_LENGTHS[1] + STEREO_SPREAD),
                AllpassFilter::new(ALLPASS_LENGTHS[2] + STEREO_SPREAD),
                AllpassFilter::new(ALLPASS_LENGTHS[3] + STEREO_SPREAD),
            ],
            room_size: 0.5,
            damping: 0.5,
            wet: 0.33,
            dry: 0.7,
        };
        rev.update_filters();
        rev
    }

    /// Recalcule le feedback et le damping des comb filters selon room_size et damping.
    fn update_filters(&mut self) {
        // Freeverb : feedback ∈ [0.7, 0.98] pour room_size ∈ [0, 1]
        let feedback = 0.7 + self.room_size * 0.28;
        let damping = self.damping;
        for c in &mut self.combs_l {
            c.set_feedback(feedback);
            c.set_damping(damping);
        }
        for c in &mut self.combs_r {
            c.set_feedback(feedback);
            c.set_damping(damping);
        }
    }
}

impl Effect for Reverb {
    fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        // Freeverb : entrée mono (mixée L+R) scalée pour éviter la saturation.
        let input = (input_l + input_r) * 0.015;

        let mut wet_l = 0.0f32;
        let mut wet_r = 0.0f32;

        // 8 comb filters en parallèle.
        for c in &mut self.combs_l {
            wet_l += c.process(input);
        }
        for c in &mut self.combs_r {
            wet_r += c.process(input);
        }

        // 4 allpass filters en série.
        for ap in &mut self.allpasses_l {
            wet_l = ap.process(wet_l);
        }
        for ap in &mut self.allpasses_r {
            wet_r = ap.process(wet_r);
        }

        (input_l * self.dry + wet_l * self.wet, input_r * self.dry + wet_r * self.wet)
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "room_size" => {
                self.room_size = value.clamp(0.0, 1.0);
                self.update_filters();
            }
            "damping" => {
                self.damping = value.clamp(0.0, 1.0);
                self.update_filters();
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
            "room_size" => self.room_size,
            "damping" => self.damping,
            "wet" => self.wet,
            "dry" => self.dry,
            _ => 0.0,
        }
    }

    fn get_all_params(&self) -> Vec<(String, f32)> {
        vec![
            ("room_size".to_string(), self.room_size),
            ("damping".to_string(), self.damping),
            ("wet".to_string(), self.wet),
            ("dry".to_string(), self.dry),
        ]
    }

    fn reset(&mut self) {
        for c in &mut self.combs_l {
            c.clear();
        }
        for c in &mut self.combs_r {
            c.clear();
        }
        for ap in &mut self.allpasses_l {
            ap.clear();
        }
        for ap in &mut self.allpasses_r {
            ap.clear();
        }
    }

    fn name(&self) -> &str {
        "Reverb"
    }

    fn effect_type(&self) -> &str {
        "reverb"
    }
}
