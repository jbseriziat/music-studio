use serde::{Deserialize, Serialize};
use crate::project::{MspProject, ProjectSummary, TemplateInfo};
use crate::project::file_io;
use crate::project::templates;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
}

/// Crée un nouveau projet vide (retourne la structure MspProject).
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

/// Retourne la liste des projets existants (triés par date de modification desc).
#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectSummary>, String> {
    file_io::list_project_files()
}

/// Retourne le chemin du dossier projets (~/MusicStudio/Projects).
#[tauri::command]
pub fn get_projects_dir() -> Result<String, String> {
    file_io::get_projects_dir().map(|p| p.to_string_lossy().into_owned())
}

/// Retourne le chemin par défaut pour un nom de projet donné.
#[tauri::command]
pub fn get_project_path(name: String) -> Result<String, String> {
    file_io::project_path_for_name(&name)
}

/// Supprime un fichier projet (.msp) depuis le disque.
#[tauri::command]
pub fn delete_project(path: String) -> Result<(), String> {
    file_io::delete_project_file(&path)
}

// ── Templates (Phase 5.6) ─────────────────────────────────────────────────────

/// Sauvegarde la config actuelle comme template.
#[tauri::command]
pub fn save_as_template(name: String, project: MspProject) -> Result<(), String> {
    templates::save_as_template(&name, &project)
}

/// Liste les templates disponibles (prédéfinis + utilisateur).
#[tauri::command]
pub fn list_templates() -> Result<Vec<TemplateInfo>, String> {
    templates::list_templates()
}

/// Charge un template par nom et retourne un MspProject pré-configuré.
#[tauri::command]
pub fn load_template(name: String) -> Result<MspProject, String> {
    templates::load_template(&name)
}
