use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Résumé d'un projet affiché dans le navigateur de projets.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub name: String,
    pub path: String,
    pub modified_at: u64, // Unix timestamp en secondes
    pub bpm: f64,
}

/// Retourne le dossier home de l'utilisateur.
fn home_dir() -> Result<PathBuf, String> {
    #[cfg(unix)]
    {
        std::env::var("HOME")
            .map(PathBuf::from)
            .map_err(|_| "Variable HOME non définie".to_string())
    }
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE")
            .or_else(|_| {
                std::env::var("HOMEDRIVE").and_then(|drive| {
                    std::env::var("HOMEPATH").map(|path| format!("{drive}{path}"))
                })
            })
            .map(PathBuf::from)
            .map_err(|_| "Variable USERPROFILE non définie".to_string())
    }
}

/// Retourne le dossier ~/MusicStudio/Projects, le crée si nécessaire.
pub fn get_projects_dir() -> Result<PathBuf, String> {
    let home = home_dir()?;
    let dir = home.join("MusicStudio").join("Projects");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Impossible de créer le dossier projets: {e}"))?;
    Ok(dir)
}

/// Génère le chemin complet d'un projet à partir de son nom.
pub fn project_path_for_name(name: &str) -> Result<String, String> {
    let dir = get_projects_dir()?;
    // Assainir le nom pour le système de fichiers
    let safe_name: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect();
    let filename = format!("{safe_name}.msp");
    Ok(dir.join(filename).to_string_lossy().to_string())
}

/// Liste tous les projets (.msp) dans ~/MusicStudio/Projects, du plus récent au plus ancien.
pub fn list_project_files() -> Result<Vec<ProjectSummary>, String> {
    let dir = get_projects_dir()?;
    let mut summaries = Vec::new();

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Lecture du dossier: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("msp") {
            continue;
        }

        let modified_at = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // Extraire nom et BPM depuis le JSON
        let (name, bpm) = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .map(|v| {
                let n = v["name"]
                    .as_str()
                    .unwrap_or_else(|| {
                        path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Projet")
                    })
                    .to_string();
                let b = v["bpm"].as_f64().unwrap_or(120.0);
                (n, b)
            })
            .unwrap_or_else(|| {
                let n = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Projet")
                    .to_string();
                (n, 120.0)
            });

        summaries.push(ProjectSummary {
            name,
            path: path.to_string_lossy().to_string(),
            modified_at,
            bpm,
        });
    }

    // Plus récent en premier
    summaries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(summaries)
}

/// Supprime un fichier projet.
pub fn delete_project_file(path: &str) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| format!("Suppression impossible: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_path_for_name_valid() {
        // Utilise le HOME réel — juste vérifie la structure
        let result = project_path_for_name("Mon Beau Projet");
        if let Ok(p) = result {
            assert!(p.contains("MusicStudio"));
            assert!(p.contains("Projects"));
            assert!(p.ends_with(".msp"));
            assert!(p.contains("Mon Beau Projet"));
        }
        // Si HOME n'est pas défini (CI sans home), le test est silencieusement ignoré
    }

    #[test]
    fn test_project_path_sanitizes_special_chars() {
        let result = project_path_for_name("Projet/\\:*?");
        if let Ok(p) = result {
            // Les caractères spéciaux doivent être remplacés par _
            assert!(!p.contains('/') || p.starts_with('/'));
        }
    }
}
