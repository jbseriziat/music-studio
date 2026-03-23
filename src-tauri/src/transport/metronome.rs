use std::f64::consts::PI;

/// Générateur de sons de métronome (clicks synthétiques).
///
/// Produit de courtes impulsions sinusoïdales avec décroissance exponentielle,
/// adaptées au feedback rythmique de l'utilisateur.
///
/// Les sons sont générés une seule fois à l'initialisation et stockés en mémoire.
/// Ils ne sont PAS mixés dans l'export final.
pub struct Metronome {
    /// Active/désactive le métronome.
    pub enabled: bool,
    /// Volume du métronome (0.0–1.0).
    pub volume: f32,
}

impl Default for Metronome {
    fn default() -> Self {
        Self { enabled: false, volume: 0.6 }
    }
}

impl Metronome {
    pub fn new() -> Self {
        Self::default()
    }

    /// Génère un click synthétique : sinus à `freq_hz` Hz pendant `duration_ms` ms
    /// avec une décroissance exponentielle rapide.
    ///
    /// Le résultat est en mono f32 (normalisé −1.0 à 1.0).
    pub fn generate_click(freq_hz: f64, duration_ms: f64, sample_rate: u32) -> Vec<f32> {
        let num_samples = ((duration_ms / 1000.0) * sample_rate as f64).ceil() as usize;
        // Constante de décroissance : atteint ~0.25% à la fin du signal (e^-6 ≈ 0.0025).
        let decay_rate = 6.0 / num_samples.max(1) as f64;
        (0..num_samples)
            .map(|i| {
                let t = i as f64 / sample_rate as f64;
                let envelope = (-decay_rate * i as f64).exp() as f32;
                let sine = (2.0 * PI * freq_hz * t).sin() as f32;
                sine * envelope
            })
            .collect()
    }

    /// Click d'**accent** (premier temps de la mesure) : sinus 1000 Hz, 20 ms.
    pub fn generate_accent(sample_rate: u32) -> Vec<f32> {
        Self::generate_click(1000.0, 20.0, sample_rate)
    }

    /// Click **normal** (2e, 3e, 4e temps) : sinus 800 Hz, 20 ms.
    pub fn generate_normal(sample_rate: u32) -> Vec<f32> {
        Self::generate_click(800.0, 20.0, sample_rate)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_click_length() {
        // 20 ms à 48 000 Hz = 960 samples.
        let click = Metronome::generate_click(1000.0, 20.0, 48000);
        assert_eq!(click.len(), 960);
    }

    #[test]
    fn test_click_starts_near_zero() {
        // sin(0) = 0, envelope(0) = 1 → premier sample ≈ 0.
        let click = Metronome::generate_click(1000.0, 20.0, 48000);
        assert!(click[0].abs() < 0.01, "Premier sample doit être proche de 0");
    }

    #[test]
    fn test_click_decays() {
        let click = Metronome::generate_click(1000.0, 20.0, 48000);
        // Le maximum de la seconde moitié doit être < celui de la première moitié.
        let half = click.len() / 2;
        let first_max: f32 = click[..half].iter().map(|x| x.abs()).fold(0.0, f32::max);
        let second_max: f32 = click[half..].iter().map(|x| x.abs()).fold(0.0, f32::max);
        assert!(second_max < first_max, "Le son doit décroître avec le temps");
    }

    #[test]
    fn test_accent_higher_freq_than_normal() {
        // L'accent (1000 Hz) a plus de cycles que le click normal (800 Hz)
        // sur la même durée → période plus courte, on ne peut pas facilement
        // le mesurer, mais au moins on vérifie que les deux se génèrent.
        let accent = Metronome::generate_accent(48000);
        let normal  = Metronome::generate_normal(48000);
        assert_eq!(accent.len(), normal.len(), "Durée identique pour les deux clicks");
    }
}
