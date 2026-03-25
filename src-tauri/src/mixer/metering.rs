use serde::Serialize;

/// Données de niveau pour un canal (track ou master).
#[derive(Debug, Clone, Default, Serialize)]
pub struct MeterData {
    pub peak_l: f32,
    pub peak_r: f32,
    pub rms_l: f32,
    pub rms_r: f32,
}

/// Accumulateur de niveau pour un canal — utilisé dans le thread audio.
#[derive(Debug, Default)]
pub struct Meter {
    pub peak_l: f32,
    pub peak_r: f32,
    rms_sum_l: f64,
    rms_sum_r: f64,
    rms_count: u32,
}

impl Meter {
    /// Met à jour le peak et accumule pour le RMS.
    #[inline]
    pub fn process_sample(&mut self, left: f32, right: f32) {
        let al = left.abs();
        let ar = right.abs();
        if al > self.peak_l {
            self.peak_l = al;
        }
        if ar > self.peak_r {
            self.peak_r = ar;
        }
        self.rms_sum_l += (left * left) as f64;
        self.rms_sum_r += (right * right) as f64;
        self.rms_count += 1;
    }

    /// Retourne les valeurs courantes et remet le compteur à zéro.
    pub fn get_and_reset(&mut self) -> MeterData {
        let count = self.rms_count.max(1) as f64;
        let data = MeterData {
            peak_l: self.peak_l,
            peak_r: self.peak_r,
            rms_l: (self.rms_sum_l / count).sqrt() as f32,
            rms_r: (self.rms_sum_r / count).sqrt() as f32,
        };
        self.peak_l = 0.0;
        self.peak_r = 0.0;
        self.rms_sum_l = 0.0;
        self.rms_sum_r = 0.0;
        self.rms_count = 0;
        data
    }
}

/// Données de niveau par piste.
#[derive(Debug, Clone, Serialize)]
pub struct TrackMeterData {
    pub track_id: u32,
    pub peak_l: f32,
    pub peak_r: f32,
    pub rms_l: f32,
    pub rms_r: f32,
}

/// Rapport de niveau complet (toutes pistes + master) — envoyé au frontend ~30 fps.
#[derive(Debug, Clone, Default, Serialize)]
pub struct MeterReport {
    pub tracks: Vec<TrackMeterData>,
    pub master: MeterData,
    // ── Mastering (Phase 5.3) ──────────────────────────────────────
    /// LUFS momentary (400ms).
    #[serde(default)]
    pub lufs_momentary: f32,
    /// LUFS short-term (3s).
    #[serde(default)]
    pub lufs_shortterm: f32,
    /// LUFS integrated (tout le morceau).
    #[serde(default)]
    pub lufs_integrated: f32,
    /// True peak en dBFS.
    #[serde(default)]
    pub true_peak_db: f32,
    /// Gain reduction du limiteur en dB (≥ 0).
    #[serde(default)]
    pub limiter_gr_db: f32,
    /// Spectre FFT (64 bins, magnitude en dB).
    #[serde(default)]
    pub spectrum: Vec<f32>,
}
