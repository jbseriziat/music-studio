use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc,
};
use super::Effect;

/// Compresseur dynamique peak-detection avec smoothing attack/release.
///
/// La réduction de gain courante (en dB, positif = plus de compression) est
/// publiée dans `gain_reduction_out` chaque frame pour lecture lock-free
/// depuis le thread principal.
pub struct Compressor {
    threshold_db: f32,
    ratio:        f32,
    attack_ms:    f32,
    release_ms:   f32,
    makeup_db:    f32,
    sample_rate:  u32,

    attack_coeff:  f32,
    release_coeff: f32,

    /// Gain de réduction lissé, en dB (< 0 = compression).
    envelope_db: f32,

    /// Valeur publiée : réduction de gain en dB (≥ 0) — bits f32 atomiques.
    pub gain_reduction_out: Arc<AtomicU32>,

    /// Sidechain : ID de la piste source (None = pas de sidechain). Phase 5.5.
    pub sidechain_source: Option<u32>,
    /// Signal sidechain externe injecté (peak level, mis à jour par le callback). Phase 5.5.
    pub sidechain_level: f32,
}

impl Compressor {
    pub fn new(sample_rate: u32, gain_reduction_out: Arc<AtomicU32>) -> Self {
        let sr = sample_rate as f32;
        let attack_ms  = 10.0f32;
        let release_ms = 100.0f32;
        Self {
            threshold_db: -20.0,
            ratio:         4.0,
            attack_ms,
            release_ms,
            makeup_db:     0.0,
            sample_rate,
            attack_coeff:  Self::ms_to_coeff(attack_ms,  sr),
            release_coeff: Self::ms_to_coeff(release_ms, sr),
            envelope_db:   0.0,
            gain_reduction_out,
            sidechain_source: None,
            sidechain_level: 0.0,
        }
    }

    /// Calcule le coefficient exponentiel pour un temps de lissage donné.
    /// `exp(-1 / (time_ms * 0.001 * sample_rate))`
    fn ms_to_coeff(time_ms: f32, sample_rate: f32) -> f32 {
        (-1.0 / (time_ms * 0.001 * sample_rate)).exp()
    }

    fn recalc_coeffs(&mut self) {
        let sr = self.sample_rate as f32;
        self.attack_coeff  = Self::ms_to_coeff(self.attack_ms,  sr);
        self.release_coeff = Self::ms_to_coeff(self.release_ms, sr);
    }
}

impl Effect for Compressor {
    fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        // Détection du niveau : sidechain si actif, sinon signal d'entrée.
        let peak = if self.sidechain_source.is_some() && self.sidechain_level > 0.0 {
            self.sidechain_level
        } else {
            input_l.abs().max(input_r.abs())
        };
        let input_db = if peak > 1e-7 { 20.0 * peak.log10() } else { -140.0 };

        // Gain de réduction cible (négatif quand au-dessus du seuil).
        let gain_target_db = if input_db > self.threshold_db {
            (self.threshold_db - input_db) * (1.0 - 1.0 / self.ratio)
        } else {
            0.0
        };

        // Smoothing : attack quand on comprime davantage (gain descend), release sinon.
        let coeff = if gain_target_db < self.envelope_db {
            self.attack_coeff
        } else {
            self.release_coeff
        };
        self.envelope_db = gain_target_db + coeff * (self.envelope_db - gain_target_db);

        // Publier la réduction de gain (valeur positive pour l'UI).
        let gr = (-self.envelope_db).max(0.0);
        self.gain_reduction_out.store(gr.to_bits(), Ordering::Relaxed);

        // Gain linéaire total = compression + makeup.
        let total_db = self.envelope_db + self.makeup_db;
        let gain = if total_db <= -60.0 { 0.0 } else { 10.0f32.powf(total_db / 20.0) };

        (input_l * gain, input_r * gain)
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "threshold" => self.threshold_db = value.clamp(-40.0, 0.0),
            "ratio"     => self.ratio        = value.clamp(1.0, 20.0),
            "attack"    => { self.attack_ms  = value.clamp(0.1, 100.0);  self.recalc_coeffs(); }
            "release"   => { self.release_ms = value.clamp(10.0, 1000.0); self.recalc_coeffs(); }
            "makeup"    => self.makeup_db    = value.clamp(0.0, 24.0),
            "sidechain" => {
                self.sidechain_source = if value > 0.0 { Some(value as u32) } else { None };
            }
            "_sidechain_level" => { self.sidechain_level = value; }
            _ => {}
        }
    }

    fn get_param(&self, name: &str) -> f32 {
        match name {
            "threshold" => self.threshold_db,
            "ratio"     => self.ratio,
            "attack"    => self.attack_ms,
            "release"   => self.release_ms,
            "makeup"    => self.makeup_db,
            "sidechain" => self.sidechain_source.map(|v| v as f32).unwrap_or(-1.0),
            _ => 0.0,
        }
    }

    fn get_all_params(&self) -> Vec<(String, f32)> {
        vec![
            ("threshold".into(), self.threshold_db),
            ("ratio".into(),     self.ratio),
            ("attack".into(),    self.attack_ms),
            ("release".into(),   self.release_ms),
            ("makeup".into(),    self.makeup_db),
            ("sidechain".into(), self.sidechain_source.map(|v| v as f32).unwrap_or(-1.0)),
        ]
    }

    fn reset(&mut self) {
        self.envelope_db = 0.0;
        self.gain_reduction_out.store(0.0f32.to_bits(), Ordering::Relaxed);
    }

    fn name(&self)        -> &str { "Compressor" }
    fn effect_type(&self) -> &str { "compressor" }
}
