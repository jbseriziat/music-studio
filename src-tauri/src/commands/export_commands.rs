use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

use crate::audio::recorder::resample_to_stereo_48k;
use crate::audio::AudioCommand;
use crate::audio::AudioEngine;
use crate::project::export::{decode_audio_file, render_project_to_wav, ExportOptions};
use crate::project::MspProject;
use crate::sampler::sample_bank::{compute_waveform, SampleBank, SampleInfo};

// ─── Payload de progression d'export ─────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
struct ExportProgress {
    percent: f32,
}

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Importe un fichier audio (WAV, MP3, OGG, FLAC) dans la banque de samples.
///
/// Décode le fichier avec symphonia, le convertit en f32 stéréo 48kHz,
/// l'ajoute à la SampleBank et le charge dans le moteur audio.
/// Retourne les informations du sample (id, durée, waveform…).
#[tauri::command]
pub fn import_audio_file(
    source_path: String,
    engine: State<Mutex<AudioEngine>>,
    bank: State<Mutex<SampleBank>>,
) -> Result<SampleInfo, String> {
    // Décoder le fichier avec symphonia.
    let (frames, src_sr, src_ch) = decode_audio_file(&source_path)?;

    // Convertir en stéréo 48 kHz.
    let frames_48k = resample_to_stereo_48k(&frames, src_ch, src_sr);

    let duration_ms = (frames_48k.len() as f64 / 2.0 / 48_000.0 * 1000.0) as u32;
    let waveform = compute_waveform(&frames_48k, 2, 128);

    // Extraire le nom du fichier.
    let name = std::path::Path::new(&source_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported")
        .to_string();

    // Ajouter à la banque de samples.
    let sample_info;
    let frames_arc: Arc<Vec<f32>>;
    {
        let mut b = bank.inner().lock().map_err(|e| e.to_string())?;
        let id = b.samples.len() as u32;
        let info = SampleInfo {
            id,
            name: name.clone(),
            category: "imported".to_string(),
            path: source_path.clone(),
            duration_ms,
            waveform: waveform.clone(),
            tags: vec!["imported".to_string()],
        };
        b.samples.push(info.clone());
        let arc = Arc::new(frames_48k);
        frames_arc = Arc::clone(&arc);
        b.audio_data.push((arc, 2u16, 48_000u32));
        sample_info = info;
    }

    // Charger dans le moteur audio.
    {
        let eng = engine.inner().lock().map_err(|e| e.to_string())?;
        eng.send_command(AudioCommand::LoadSample {
            id: sample_info.id,
            data: frames_arc,
            channels: 2,
            sample_rate: 48_000,
        });
    }

    Ok(sample_info)
}

/// Exporte le projet en un fichier WAV.
///
/// `project` : état courant du projet (envoyé par le frontend, même structure que save_project).
/// `path`    : chemin de sortie absolu.
/// `options` : format, bit_depth, normalize, sample_rate.
///
/// Émet des événements Tauri `"export://progress"` { percent: f32 } pendant le rendu.
///
/// Note : seuls les clips audio (pistes de type "audio") sont rendus dans cette version.
/// Les patterns drum et les notes synth nécessitent le moteur audio en temps réel.
#[tauri::command]
pub fn export_project(
    project: MspProject,
    path: String,
    options: ExportOptions,
    bank: State<Mutex<SampleBank>>,
    handle: AppHandle,
) -> Result<(), String> {
    // Créer un snapshot de la banque (pour éviter de la garder verrouillée).
    let snap = {
        let b = bank.inner().lock().map_err(|e| e.to_string())?;
        SampleBankSnapshot::from(&*b)
    };
    let bank_local = snap.into_sample_bank();

    // Callback de progression → émet des événements Tauri.
    let progress_cb = move |pct: f32| {
        let _ = handle.emit("export://progress", ExportProgress { percent: pct });
    };

    render_project_to_wav(&project, &bank_local, &path, &options, progress_cb)
}

/// Retourne le chemin d'export par défaut pour un nom de projet donné.
#[tauri::command]
pub fn get_export_path(project_name: String) -> Result<String, String> {
    let home = {
        #[cfg(unix)]
        { std::env::var("HOME").map_err(|_| "Variable HOME non définie".to_string())? }
        #[cfg(windows)]
        { std::env::var("USERPROFILE").map_err(|_| "Variable USERPROFILE non définie".to_string())? }
    };
    let path = std::path::PathBuf::from(home)
        .join("MusicStudio")
        .join("Exports")
        .join(format!("{project_name}.wav"));
    Ok(path.to_string_lossy().into_owned())
}

// ─── Snapshot de la banque de samples ────────────────────────────────────────

/// Snapshot de SampleBank (clones Arc pour passer au thread de rendu sans lock).
struct SampleBankSnapshot {
    audio_data: Vec<(Arc<Vec<f32>>, u16, u32)>,
    samples: Vec<SampleInfo>,
}

impl SampleBankSnapshot {
    fn from(bank: &SampleBank) -> Self {
        Self {
            audio_data: bank
                .audio_data
                .iter()
                .map(|(d, c, sr)| (Arc::clone(d), *c, *sr))
                .collect(),
            samples: bank.samples.clone(),
        }
    }

    fn into_sample_bank(self) -> SampleBank {
        SampleBank {
            samples: self.samples,
            audio_data: self.audio_data,
        }
    }
}
