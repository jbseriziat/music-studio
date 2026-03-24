use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, SampleRate, StreamConfig, SupportedStreamConfig};
use hound::{SampleFormat, WavSpec, WavWriter};
use std::sync::{Arc, Mutex};

/// Wrapper Send pour cpal::Stream (non-Send sur Linux/ALSA).
struct SendableStream(cpal::Stream);
#[allow(clippy::non_send_fields_in_send_ty)]
unsafe impl Send for SendableStream {}

/// Informations sur un périphérique d'entrée audio.
#[derive(Debug, Clone, serde::Serialize)]
pub struct InputDeviceInfo {
    pub name: String,
}

/// Gère l'enregistrement audio depuis un périphérique d'entrée.
///
/// Le buffer d'enregistrement est pré-alloué pour 30 secondes (≈ 11 MB).
/// L'enregistrement est déclenché via `start()` et terminé via `stop()`,
/// qui écrit le WAV et retourne son chemin.
pub struct Recorder {
    /// Piste actuellement armée pour l'enregistrement.
    pub armed_track_id: Option<u32>,
    /// Indique si un enregistrement est en cours.
    pub is_recording: bool,
    /// Active/désactive l'écoute du micro en temps réel (monitoring).
    pub monitoring_enabled: bool,
    /// Données capturées (f32 entrelacées, stéréo 48kHz).
    recorded_frames: Arc<Mutex<Vec<f32>>>,
    /// Stream d'entrée cpal — maintenu en vie pendant l'enregistrement.
    _input_stream: Option<SendableStream>,
    /// Sample rate du périphérique d'entrée (peut différer de 48 kHz).
    input_sample_rate: u32,
    /// Nombre de canaux du périphérique d'entrée.
    input_channels: u16,
    /// Nom du périphérique d'entrée sélectionné (None = périphérique par défaut).
    pub selected_device_name: Option<String>,
}

impl Recorder {
    /// Crée un nouveau recorder (aucun stream ouvert, buffer vide).
    pub fn new() -> Self {
        // Pré-alloue pour 30 s × 48 kHz × 2 canaux = 2 880 000 f32 ≈ 11 MB.
        let capacity = 30 * 48_000 * 2;
        Self {
            armed_track_id: None,
            is_recording: false,
            monitoring_enabled: false,
            recorded_frames: Arc::new(Mutex::new(Vec::with_capacity(capacity))),
            _input_stream: None,
            input_sample_rate: 48_000,
            input_channels: 2,
            selected_device_name: None,
        }
    }

    /// Retourne la liste des périphériques d'entrée disponibles.
    pub fn list_input_devices() -> Result<Vec<InputDeviceInfo>, String> {
        let host = cpal::default_host();
        let devices = host
            .input_devices()
            .map_err(|e| format!("Erreur cpal input_devices: {e}"))?
            .filter_map(|d| {
                let name = d.name().ok()?;
                Some(InputDeviceInfo { name })
            })
            .collect();
        Ok(devices)
    }

    /// Démarre l'enregistrement depuis le périphérique d'entrée sélectionné.
    /// Si `selected_device_name` est None, utilise le périphérique par défaut.
    pub fn start(&mut self) -> Result<(), String> {
        if self.is_recording {
            return Err("Enregistrement déjà en cours".to_string());
        }

        let host = cpal::default_host();

        // Sélectionner le périphérique d'entrée.
        let device = if let Some(ref name) = self.selected_device_name {
            host.input_devices()
                .map_err(|e| format!("Périphériques: {e}"))?
                .find(|d| d.name().ok().as_deref() == Some(name.as_str()))
                .ok_or_else(|| format!("Périphérique non trouvé : {name}"))?
        } else {
            host.default_input_device()
                .ok_or("Aucun périphérique d'entrée par défaut")?
        };

        let supported: SupportedStreamConfig = device
            .default_input_config()
            .map_err(|e| format!("Config d'entrée: {e}"))?;

        let sample_rate = supported.sample_rate().0;
        let channels = supported.channels();

        self.input_sample_rate = sample_rate;
        self.input_channels = channels;

        let stream_config = StreamConfig {
            channels,
            sample_rate: SampleRate(sample_rate),
            buffer_size: BufferSize::Default,
        };

        // Réinitialiser le buffer (on garde la capacité pré-allouée).
        {
            let mut buf = self.recorded_frames.lock().map_err(|e| e.to_string())?;
            buf.clear();
        }

        let frames_arc = Arc::clone(&self.recorded_frames);

        let stream = device
            .build_input_stream(
                &stream_config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    // Le callback d'entrée : on verrouille et étend le buffer.
                    // Pour l'enregistrement, un Mutex dans le callback est acceptable
                    // (latence de monitoring non critique).
                    if let Ok(mut buf) = frames_arc.try_lock() {
                        buf.extend_from_slice(data);
                    }
                },
                move |err| {
                    eprintln!("[Recorder] Erreur stream entrée: {err}");
                },
                None,
            )
            .map_err(|e| format!("build_input_stream: {e}"))?;

        stream.play().map_err(|e| format!("stream.play(): {e}"))?;

        self._input_stream = Some(SendableStream(stream));
        self.is_recording = true;

        eprintln!("[Recorder] Enregistrement démarré : {sample_rate} Hz, {channels} ch");
        Ok(())
    }

    /// Arrête l'enregistrement, écrit le WAV et retourne son chemin.
    /// `project_dir` est le dossier du projet courant (ex: ~/MusicStudio/Projects/MonProjet).
    pub fn stop(&mut self, project_dir: &str) -> Result<String, String> {
        if !self.is_recording {
            return Err("Aucun enregistrement en cours".to_string());
        }

        // Arrêter le stream (le drop déclenche l'arrêt).
        self._input_stream = None;
        self.is_recording = false;

        // Récupérer les données.
        let frames = {
            let buf = self.recorded_frames.lock().map_err(|e| e.to_string())?;
            buf.clone()
        };

        if frames.is_empty() {
            return Err("Aucun échantillon enregistré".to_string());
        }

        // Convertir en stéréo 48 kHz si nécessaire (simple upsampling/downmix).
        let frames_stereo = convert_to_stereo_48k(
            &frames,
            self.input_channels,
            self.input_sample_rate,
        );

        // Créer le dossier recordings/.
        let rec_dir = std::path::PathBuf::from(project_dir).join("recordings");
        std::fs::create_dir_all(&rec_dir)
            .map_err(|e| format!("mkdir recordings: {e}"))?;

        // Nom de fichier avec timestamp.
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let wav_path = rec_dir.join(format!("rec_{ts}.wav"));
        let wav_path_str = wav_path.to_string_lossy().into_owned();

        // Écrire le WAV 48 kHz 32-bit float stéréo.
        let spec = WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        };
        let mut writer = WavWriter::create(&wav_path, spec)
            .map_err(|e| format!("WavWriter::create: {e}"))?;
        for &sample in &frames_stereo {
            writer
                .write_sample(sample)
                .map_err(|e| format!("write_sample: {e}"))?;
        }
        writer.finalize().map_err(|e| format!("finalize: {e}"))?;

        eprintln!(
            "[Recorder] WAV enregistré : {} ({} frames)",
            wav_path_str,
            frames_stereo.len() / 2
        );
        Ok(wav_path_str)
    }
}

/// Version publique de `convert_to_stereo_48k` pour usage depuis d'autres modules.
pub fn resample_to_stereo_48k(frames: &[f32], channels: u16, src_rate: u32) -> Vec<f32> {
    convert_to_stereo_48k(frames, channels, src_rate)
}

/// Convertit des frames audio vers stéréo 48 kHz f32.
/// Downmix mono→stéréo, duplication des canaux supplémentaires ignorés.
/// Re-sampling: interpolation linéaire si le sample rate diffère.
fn convert_to_stereo_48k(frames: &[f32], channels: u16, src_rate: u32) -> Vec<f32> {
    // Étape 1 : downmix vers stéréo si nécessaire.
    let stereo: Vec<f32> = match channels {
        1 => frames.iter().flat_map(|&s| [s, s]).collect(),
        2 => frames.to_vec(),
        n => {
            // Garder uniquement les canaux 0 et 1.
            frames
                .chunks(n as usize)
                .flat_map(|ch| [ch[0], ch.get(1).copied().unwrap_or(ch[0])])
                .collect()
        }
    };

    // Étape 2 : re-sampling si le sample rate diffère de 48 kHz.
    if src_rate == 48_000 {
        return stereo;
    }

    let src_frames = stereo.len() / 2;
    let ratio = src_rate as f64 / 48_000.0;
    let dst_frames = (src_frames as f64 / ratio).round() as usize;
    let mut out = Vec::with_capacity(dst_frames * 2);

    for i in 0..dst_frames {
        let src_pos = i as f64 * ratio;
        let idx = src_pos as usize;
        let frac = (src_pos - idx as f64) as f32;
        let next_idx = (idx + 1).min(src_frames - 1);

        let l = stereo[idx * 2]     + (stereo[next_idx * 2]     - stereo[idx * 2])     * frac;
        let r = stereo[idx * 2 + 1] + (stereo[next_idx * 2 + 1] - stereo[idx * 2 + 1]) * frac;
        out.push(l);
        out.push(r);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mono_to_stereo() {
        let mono = vec![0.1, 0.5, -0.3];
        let stereo = convert_to_stereo_48k(&mono, 1, 48_000);
        assert_eq!(stereo, vec![0.1, 0.1, 0.5, 0.5, -0.3, -0.3]);
    }

    #[test]
    fn test_stereo_passthrough() {
        let stereo = vec![0.1, 0.2, 0.3, 0.4];
        let out = convert_to_stereo_48k(&stereo, 2, 48_000);
        assert_eq!(out, stereo);
    }
}
