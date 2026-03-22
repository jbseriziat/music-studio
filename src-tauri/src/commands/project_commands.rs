use serde::{Deserialize, Serialize};
use crate::project::MspProject;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
}

/// Crée un nouveau projet vide.
#[tauri::command]
pub fn new_project(name: String) -> Result<MspProject, String> {
    Ok(MspProject::new(&name, "default", 1))
}

/// Sauvegarde le projet courant dans un fichier .msp.
#[tauri::command]
pub fn save_project(path: String, project: MspProject) -> Result<(), String> {
    crate::project::project::save_to_file(&project, &path)
}

/// Charge un projet depuis le disque.
#[tauri::command]
pub fn load_project(path: String) -> Result<MspProject, String> {
    crate::project::project::load_from_file(&path)
}
