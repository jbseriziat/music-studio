use crate::drums::DrumPattern;

/// Moteur de séquencement pas-à-pas pour le Drum Rack.
///
/// Le séquenceur est conçu pour être utilisé **sans allocation** à l'intérieur
/// du callback audio (contrainte temps-réel). Toutes les données sont stockées
/// dans des tableaux de taille fixe sur la pile.
///
/// # Résolution
/// Chaque step correspond à une double-croche (1/16 de mesure).
/// À 120 BPM et 48 000 Hz : `samples_per_step = 48000 * 60 / (120 * 4) = 6000`.
pub struct StepSequencer {
    /// Index du step actuellement joué (0..steps).
    pub current_step: usize,
    /// Durée d'un step en samples (float pour précision sous-sample).
    pub samples_per_step: f64,
    /// Compteur de samples accumulés depuis le début du step courant.
    pub sample_counter: f64,
    /// Nombre de steps du pattern (8, 16 ou 32).
    pub steps: usize,
    /// Étapes activées : pad_steps\[pad_index\]\[step_index\].
    pub pad_steps: [[bool; 32]; 8],
    /// Vélocités par step : pad_velocities\[pad_index\]\[step_index\] (0.0–1.0).
    pub pad_velocities: [[f32; 32]; 8],
}

impl Default for StepSequencer {
    fn default() -> Self {
        Self::new(120.0, 48000)
    }
}

impl StepSequencer {
    /// Crée un nouveau séquenceur avec le BPM et le sample rate donnés.
    pub fn new(bpm: f64, sample_rate: u32) -> Self {
        let mut seq = Self {
            current_step: 0,
            samples_per_step: 0.0,
            sample_counter: 0.0,
            steps: 16,
            pad_steps: [[false; 32]; 8],
            pad_velocities: [[1.0; 32]; 8],
        };
        seq.update_bpm(bpm, sample_rate);
        seq
    }

    /// Recalcule `samples_per_step` après un changement de BPM ou de sample rate.
    ///
    /// Formula : `samples_per_step = sample_rate * 60 / (bpm * 4)`
    /// (1 step = 1 double-croche = 1/4 de beat à 4/4)
    pub fn update_bpm(&mut self, bpm: f64, sample_rate: u32) {
        let bpm = bpm.max(1.0); // Éviter la division par zéro.
        self.samples_per_step = (sample_rate as f64 * 60.0) / (bpm * 4.0);
    }

    /// Charge un pattern dans le séquenceur.
    /// Réinitialise le step courant si il dépasse la nouvelle longueur.
    pub fn load_pattern(&mut self, pattern: &DrumPattern) {
        self.steps = (pattern.steps as usize).clamp(1, 32);
        for (p, pad_data) in pattern.pads.iter().enumerate().take(8) {
            for (s, &active) in pad_data.iter().enumerate().take(32) {
                self.pad_steps[p][s] = active;
            }
        }
        for (p, pad_vels) in pattern.velocities.iter().enumerate().take(8) {
            for (s, &vel) in pad_vels.iter().enumerate().take(32) {
                self.pad_velocities[p][s] = vel.clamp(0.0, 1.0);
            }
        }
        if self.current_step >= self.steps {
            self.current_step = 0;
            self.sample_counter = 0.0;
        }
    }

    /// Réinitialise le séquenceur à l'état initial (step 0, compteur à 0).
    pub fn reset(&mut self) {
        self.current_step = 0;
        self.sample_counter = 0.0;
    }

    /// Avance d'un sample et appelle `on_trigger` pour chaque pad à déclencher.
    ///
    /// Le callback reçoit `(pad_index: u8, velocity: f32)`.
    /// **Aucune allocation** — le callback est une fermeture inlinée.
    ///
    /// Retourne `true` si un nouveau step a démarré ce sample.
    pub fn process_tick<F>(&mut self, mut on_trigger: F) -> bool
    where
        F: FnMut(u8, f32),
    {
        if self.samples_per_step <= 0.0 {
            return false;
        }

        self.sample_counter += 1.0;
        if self.sample_counter < self.samples_per_step {
            return false;
        }

        // Nouveau step.
        self.sample_counter -= self.samples_per_step;
        self.current_step = (self.current_step + 1) % self.steps;

        // Déclencher les pads actifs.
        for pad in 0..8usize {
            if self.pad_steps[pad][self.current_step] {
                let vel = self.pad_velocities[pad][self.current_step];
                on_trigger(pad as u8, vel);
            }
        }

        true
    }
}

// ─── Tests unitaires ──────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 48000;
    const BPM: f64 = 120.0;
    // À 120 BPM/48kHz : 1 step = 6000 samples.
    const SPB: usize = 6000;

    #[test]
    fn test_samples_per_step_at_120bpm() {
        let seq = StepSequencer::new(BPM, SR);
        assert!(
            (seq.samples_per_step - SPB as f64).abs() < 1.0,
            "Attendu ~{SPB}, obtenu {}",
            seq.samples_per_step
        );
    }

    #[test]
    fn test_update_bpm_halves_speed() {
        let mut seq = StepSequencer::new(BPM, SR);
        seq.update_bpm(60.0, SR);
        assert!(
            (seq.samples_per_step - SPB as f64 * 2.0).abs() < 1.0,
            "À 60 BPM, samples_per_step devrait être 2× plus grand"
        );
    }

    #[test]
    fn test_step_advances_after_n_ticks() {
        let mut seq = StepSequencer::new(BPM, SR);
        let mut triggers: Vec<(u8, f32)> = Vec::new();

        // Activer le pad 0 au step 0.
        seq.pad_steps[0][0] = true;
        // Le séquenceur démarre au step 0 ; le premier step 0 est déclenché
        // après `SPB` samples (car process_tick n'est pas déclenché avant que
        // sample_counter >= samples_per_step).
        seq.reset();

        // Avancer exactement SPB samples → step 1 (pas de trigger car pad 0 step 1 = false).
        let mut new_step = false;
        for _ in 0..SPB {
            new_step = seq.process_tick(|pad, vel| triggers.push((pad, vel)));
        }
        assert!(new_step, "Un nouveau step doit être déclenché après SPB samples");
        assert_eq!(seq.current_step, 1, "Après {SPB} samples, on est au step 1");
        assert!(triggers.is_empty(), "Aucun pad actif au step 1");
    }

    #[test]
    fn test_trigger_fires_active_pad() {
        let mut seq = StepSequencer::new(BPM, SR);
        // Activer pad 2 au step 1.
        seq.pad_steps[2][1] = true;
        seq.pad_velocities[2][1] = 0.8;
        seq.current_step = 0; // On commence juste avant le step 1.

        let mut triggers: Vec<(u8, f32)> = Vec::new();

        // Avancer jusqu'au step 1.
        for _ in 0..SPB {
            seq.process_tick(|p, v| triggers.push((p, v)));
        }

        assert_eq!(seq.current_step, 1);
        assert_eq!(triggers.len(), 1, "Exactement 1 trigger attendu");
        assert_eq!(triggers[0].0, 2, "Pad 2 devrait être déclenché");
        assert!(
            (triggers[0].1 - 0.8).abs() < 1e-5,
            "Vélocité 0.8 attendue"
        );
    }

    #[test]
    fn test_pattern_loops_after_last_step() {
        let mut seq = StepSequencer::new(BPM, SR);
        seq.steps = 4; // Pattern court de 4 steps.

        // Avancer 4 * SPB samples → on doit revenir au step 0.
        for _ in 0..4 * SPB {
            seq.process_tick(|_, _| {});
        }
        assert_eq!(seq.current_step, 0, "Après 4 steps, on est revenu au step 0");
    }

    #[test]
    fn test_load_pattern_updates_steps() {
        let mut seq = StepSequencer::new(BPM, SR);
        let pattern = DrumPattern::default(); // 16 steps, kick 0+8, snare 4+12...

        seq.load_pattern(&pattern);
        assert_eq!(seq.steps, 16);
        assert!(seq.pad_steps[0][0], "Kick au step 0");
        assert!(seq.pad_steps[0][8], "Kick au step 8");
        assert!(seq.pad_steps[1][4], "Snare au step 4");
        assert!(!seq.pad_steps[1][0], "Pas de snare au step 0");
    }

    #[test]
    fn test_no_trigger_when_steps_empty() {
        let mut seq = StepSequencer::new(BPM, SR);
        // Tous les pads désactivés par défaut.
        let mut fired = false;
        for _ in 0..SPB * 16 {
            seq.process_tick(|_, _| { fired = true; });
        }
        assert!(!fired, "Aucun trigger sans pad actif");
    }
}
