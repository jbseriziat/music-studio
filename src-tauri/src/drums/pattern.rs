use serde::{Deserialize, Serialize};

/// Pattern de séquenceur pas-à-pas, sérialisable pour l'IPC et la sauvegarde.
/// Contient les étapes activées et les vélocités pour 8 pads et jusqu'à 32 steps.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrumPattern {
    /// Nombre d'étapes actives (8, 16, ou 32).
    pub steps: u8,
    /// Étapes activées : pads\[pad_index\]\[step_index\]
    pub pads: Vec<Vec<bool>>,
    /// Vélocités : velocities\[pad_index\]\[step_index\] (0.0 – 1.0)
    pub velocities: Vec<Vec<f32>>,
}

impl Default for DrumPattern {
    fn default() -> Self {
        let mut pads = vec![vec![false; 32]; 8];
        let velocities = vec![vec![1.0f32; 32]; 8];
        // Beat par défaut :
        // Pad 0 (kick)  : temps 1 et 3 → steps 0, 8
        pads[0][0] = true;
        pads[0][8] = true;
        // Pad 1 (snare) : temps 2 et 4 → steps 4, 12
        pads[1][4] = true;
        pads[1][12] = true;
        // Pad 2 (hihat) : chaque double-croche → steps 0,2,4,6,8,10,12,14
        for i in (0..16usize).step_by(2) {
            pads[2][i] = true;
        }
        DrumPattern { steps: 16, pads, velocities }
    }
}

impl DrumPattern {
    /// Crée un pattern vide (tous les steps désactivés).
    pub fn empty() -> Self {
        DrumPattern {
            steps: 16,
            pads: vec![vec![false; 32]; 8],
            velocities: vec![vec![1.0f32; 32]; 8],
        }
    }
}
