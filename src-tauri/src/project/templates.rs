use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::file_io::home_dir_path;
use super::project::{MspProject, ProjectTrack};

/// Informations sur un template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateInfo {
    pub name: String,
    pub path: String,
}

/// Retourne le dossier ~/MusicStudio/Templates, le crée si nécessaire.
fn get_templates_dir() -> Result<PathBuf, String> {
    let home = home_dir_path()?;
    let dir = home.join("MusicStudio").join("Templates");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Impossible de créer le dossier templates: {e}"))?;
    Ok(dir)
}

/// Sauvegarde la config du projet comme template (pistes + effets, sans clips/notes).
pub fn save_as_template(name: &str, project: &MspProject) -> Result<(), String> {
    let dir = get_templates_dir()?;
    let safe_name: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect();
    let path = dir.join(format!("{safe_name}.mst"));

    // Créer une copie sans clips ni notes.
    let mut template = project.clone();
    template.name = name.to_string();
    for track in &mut template.tracks {
        track.clips.clear();
    }
    if let Some(ref mut inst) = template.instrument_tracks {
        for it in inst.iter_mut() {
            it.midi_clips.clear();
        }
    }
    template.drum_pattern = None;

    let json = serde_json::to_string_pretty(&template)
        .map_err(|e| format!("Sérialisation template échouée: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Écriture template échouée: {e}"))?;
    Ok(())
}

/// Liste les templates existants (fichiers .mst) + les prédéfinis.
pub fn list_templates() -> Result<Vec<TemplateInfo>, String> {
    let mut templates = builtin_template_names();

    let dir = get_templates_dir()?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "mst") {
                let name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if !templates.iter().any(|t| t.name == name) {
                    templates.push(TemplateInfo {
                        name,
                        path: path.to_string_lossy().into_owned(),
                    });
                }
            }
        }
    }

    Ok(templates)
}

/// Charge un template par nom. Retourne un MspProject pré-configuré.
pub fn load_template(name: &str) -> Result<MspProject, String> {
    // D'abord essayer les prédéfinis.
    if let Some(project) = builtin_template(name) {
        return Ok(project);
    }

    // Sinon chercher dans le dossier templates.
    let dir = get_templates_dir()?;
    let path = dir.join(format!("{name}.mst"));
    if !path.exists() {
        return Err(format!("Template '{name}' introuvable"));
    }
    let json = std::fs::read_to_string(&path)
        .map_err(|e| format!("Lecture template échouée: {e}"))?;
    let project: MspProject = serde_json::from_str(&json)
        .map_err(|e| format!("Désérialisation template échouée: {e}"))?;
    Ok(project)
}

fn builtin_template_names() -> Vec<TemplateInfo> {
    vec![
        TemplateInfo { name: "Beat Making".to_string(), path: "builtin".to_string() },
        TemplateInfo { name: "Song Writing".to_string(), path: "builtin".to_string() },
        TemplateInfo { name: "Sound Design".to_string(), path: "builtin".to_string() },
    ]
}

fn builtin_template(name: &str) -> Option<MspProject> {
    let mut p = MspProject::new(name, "default", 5);
    match name {
        "Beat Making" => {
            p.tracks = vec![
                ProjectTrack {
                    id: "dr1".into(), name: "Drums".into(), color: "#FF5722".into(),
                    volume: 1.0, pan: 0.0, muted: false, solo: false,
                    clips: vec![], track_type: Some("drum_rack".into()), automations: vec![],
                },
                ProjectTrack {
                    id: "a1".into(), name: "Samples".into(), color: "#2196F3".into(),
                    volume: 1.0, pan: 0.0, muted: false, solo: false,
                    clips: vec![], track_type: Some("audio".into()), automations: vec![],
                },
            ];
            Some(p)
        }
        "Song Writing" => {
            p.tracks = vec![
                ProjectTrack {
                    id: "i1".into(), name: "Piano".into(), color: "#9C27B0".into(),
                    volume: 1.0, pan: 0.0, muted: false, solo: false,
                    clips: vec![], track_type: Some("instrument".into()), automations: vec![],
                },
                ProjectTrack {
                    id: "a1".into(), name: "Voix".into(), color: "#4CAF50".into(),
                    volume: 1.0, pan: 0.0, muted: false, solo: false,
                    clips: vec![], track_type: Some("audio".into()), automations: vec![],
                },
                ProjectTrack {
                    id: "dr1".into(), name: "Drums".into(), color: "#FF5722".into(),
                    volume: 1.0, pan: 0.0, muted: false, solo: false,
                    clips: vec![], track_type: Some("drum_rack".into()), automations: vec![],
                },
            ];
            Some(p)
        }
        "Sound Design" => {
            p.tracks = vec![
                ProjectTrack {
                    id: "i1".into(), name: "Synth".into(), color: "#E91E63".into(),
                    volume: 1.0, pan: 0.0, muted: false, solo: false,
                    clips: vec![], track_type: Some("instrument".into()), automations: vec![],
                },
            ];
            Some(p)
        }
        _ => None,
    }
}
