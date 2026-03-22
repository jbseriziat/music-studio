use serde::{Deserialize, Serialize};

/// Format de fichier projet Music Studio (.msp = JSON)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MspProject {
    pub version: String,
    pub name: String,
    pub profile_id: String,
    pub level_created_at: u8,
    pub bpm: f64,
    pub tracks: Vec<ProjectTrack>,
    pub pads: Vec<ProjectPad>,
}

impl MspProject {
    pub fn new(name: &str, profile_id: &str, level: u8) -> Self {
        MspProject {
            version: "1.0".to_string(),
            name: name.to_string(),
            profile_id: profile_id.to_string(),
            level_created_at: level,
            bpm: 120.0,
            tracks: Vec::new(),
            pads: Self::default_pads(),
        }
    }

    fn default_pads() -> Vec<ProjectPad> {
        (0..16)
            .map(|i| ProjectPad {
                id: i,
                sample_id: Some(i as u32),
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectTrack {
    pub id: String,
    pub name: String,
    pub color: String,
    pub volume: f32,
    pub pan: f32,
    pub muted: bool,
    pub solo: bool,
    pub clips: Vec<ProjectClip>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectClip {
    pub id: String,
    pub sample_id: u32,
    pub position: f64,   // en secondes
    pub duration: f64,   // en secondes
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectPad {
    pub id: u8,
    pub sample_id: Option<u32>,
}

/// Sauvegarde un projet dans un fichier .msp.
pub fn save_to_file(project: &MspProject, path: &str) -> Result<(), String> {
    let json = serde_json::to_string_pretty(project)
        .map_err(|e| format!("Sérialisation: {e}"))?;
    // Créer le dossier parent si nécessaire.
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    std::fs::write(path, json).map_err(|e| format!("Écriture: {e}"))
}

/// Charge un projet depuis un fichier .msp.
pub fn load_from_file(path: &str) -> Result<MspProject, String> {
    let json = std::fs::read_to_string(path).map_err(|e| format!("Lecture: {e}"))?;
    serde_json::from_str(&json).map_err(|e| format!("Désérialisation: {e}"))
}
