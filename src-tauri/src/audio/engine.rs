use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, SampleRate, StreamConfig};
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapRb,
};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};

use super::commands::AudioCommand;
use super::config::AudioConfig;

// ─── Wrapper Send pour cpal::Stream (non-Send sur Linux/ALSA) ────────────────
#[allow(dead_code)]
struct SendableStream(cpal::Stream);
#[allow(clippy::non_send_fields_in_send_ty)]
unsafe impl Send for SendableStream {}

// ─── Sample data stocké dans le callback audio ────────────────────────────────
struct SampleData {
    /// Frames entrelacées f32 (mono ou stéréo, 48kHz).
    frames: Vec<f32>,
    channels: u16,
    #[allow(dead_code)]
    sample_rate: u32,
}

// ─── Une voix de lecture (pad ou clip) ───────────────────────────────────────
struct Voice {
    sample_id: u32,
    /// Position en frames (index dans SampleData::frames / channels).
    position: usize,
}

impl Voice {
    /// Lit la prochaine frame stéréo. Retourne (0.0, 0.0) si le sample est inconnu.
    fn next_stereo(&mut self, samples: &[Option<SampleData>]) -> (f32, f32) {
        let Some(Some(sd)) = samples.get(self.sample_id as usize) else {
            return (0.0, 0.0);
        };
        let num_frames = sd.frames.len() / sd.channels as usize;
        if self.position >= num_frames {
            return (0.0, 0.0);
        }
        let base = self.position * sd.channels as usize;
        let l = sd.frames[base];
        let r = if sd.channels > 1 { sd.frames[base + 1] } else { l };
        self.position += 1;
        (l, r)
    }

    fn is_done(&self, samples: &[Option<SampleData>]) -> bool {
        match samples.get(self.sample_id as usize) {
            Some(Some(sd)) => self.position >= sd.frames.len() / sd.channels as usize,
            _ => true,
        }
    }
}

// ─── Clip sur la timeline ─────────────────────────────────────────────────────
struct TimelineClip {
    id: u32,
    sample_id: u32,
    position_frames: u64,
    duration_frames: u64,
}

// ─── État du callback audio ───────────────────────────────────────────────────
struct AudioCallbackState {
    master_volume: f32,
    is_playing: bool,
    position_frames: u64,
    sample_rate: u32,

    /// Banque de samples : indexé par sample_id. Pré-alloué à 256.
    samples: Vec<Option<SampleData>>,

    /// Config des 16 pads (pad_id → sample_id optionnel).
    pad_configs: [Option<u32>; 16],
    /// Voix de pad actives (polyphonie). Pré-alloué à 128.
    pad_voices: Vec<Voice>,

    /// Voix de prévisualisation (une seule à la fois).
    preview_voice: Option<Voice>,

    /// Clips de la timeline.
    clips: Vec<TimelineClip>,
    /// Voix de clip actives : (clip_id, voice). Pré-alloué à 64.
    clip_voices: Vec<(u32, Voice)>,

    /// Référence partagée pour exposer la position au thread principal.
    position_atomic: Arc<AtomicU64>,
    is_playing_atomic: Arc<AtomicBool>,
}

impl AudioCallbackState {
    fn handle_command(&mut self, cmd: AudioCommand) {
        match cmd {
            AudioCommand::Play => {
                self.is_playing = true;
                self.is_playing_atomic.store(true, Ordering::Relaxed);
            }
            AudioCommand::Pause => {
                self.is_playing = false;
                self.is_playing_atomic.store(false, Ordering::Relaxed);
            }
            AudioCommand::Stop => {
                self.is_playing = false;
                self.position_frames = 0;
                self.clip_voices.clear();
                self.is_playing_atomic.store(false, Ordering::Relaxed);
                self.position_atomic.store(0, Ordering::Relaxed);
            }
            AudioCommand::SetPosition { frames } => {
                self.position_frames = frames;
                self.clip_voices.clear();
                self.position_atomic.store(frames, Ordering::Relaxed);
            }
            AudioCommand::SetMasterVolume(v) => {
                self.master_volume = v.clamp(0.0, 1.0);
            }
            AudioCommand::LoadSample { id, data, channels, sample_rate } => {
                let idx = id as usize;
                if idx < self.samples.len() {
                    // Pas d'allocation : on remplace un slot existant.
                    // Arc<Vec<f32>> est juste un pointeur — pas de deep copy.
                    self.samples[idx] = Some(SampleData {
                        frames: Arc::try_unwrap(data).unwrap_or_else(|arc| (*arc).clone()),
                        channels,
                        sample_rate,
                    });
                }
                // Si idx >= 256, on ignore silencieusement (limite de design).
            }
            AudioCommand::AssignPad { pad_id, sample_id } => {
                if (pad_id as usize) < 16 {
                    self.pad_configs[pad_id as usize] = sample_id;
                }
            }
            AudioCommand::TriggerPad { pad_id } => {
                if let Some(sample_id) = self.pad_configs.get(pad_id as usize).and_then(|s| *s) {
                    // Limite à 8 voix par pad : supprime la plus ancienne si dépassé.
                    let count = self.pad_voices.iter().filter(|v| v.sample_id == sample_id).count();
                    if count >= 8 {
                        if let Some(pos) = self.pad_voices.iter().position(|v| v.sample_id == sample_id) {
                            self.pad_voices.remove(pos);
                        }
                    }
                    if self.pad_voices.len() < 128 {
                        self.pad_voices.push(Voice { sample_id, position: 0 });
                    }
                }
            }
            AudioCommand::PreviewSample { id } => {
                self.preview_voice = Some(Voice { sample_id: id, position: 0 });
            }
            AudioCommand::StopPreview => {
                self.preview_voice = None;
            }
            AudioCommand::AddClip { id, sample_id, position_frames, duration_frames } => {
                // Retirer un clip existant avec le même id si présent.
                self.clips.retain(|c| c.id != id);
                self.clips.push(TimelineClip { id, sample_id, position_frames, duration_frames });
            }
            AudioCommand::MoveClip { id, new_position_frames } => {
                if let Some(clip) = self.clips.iter_mut().find(|c| c.id == id) {
                    clip.position_frames = new_position_frames;
                }
                // Retirer la voix active si elle existe (le clip recommencera au bon moment).
                self.clip_voices.retain(|(cid, _)| *cid != id);
            }
            AudioCommand::DeleteClip { id } => {
                self.clips.retain(|c| c.id != id);
                self.clip_voices.retain(|(cid, _)| *cid != id);
            }
            AudioCommand::ClearTimeline => {
                self.clips.clear();
                self.clip_voices.clear();
                self.position_frames = 0;
                self.is_playing = false;
                self.is_playing_atomic.store(false, Ordering::Relaxed);
                self.position_atomic.store(0, Ordering::Relaxed);
            }
        }
    }
}

// ─── Moteur audio public ──────────────────────────────────────────────────────
pub struct AudioEngine {
    command_sender: Option<Arc<Mutex<ringbuf::HeapProd<AudioCommand>>>>,
    _stream: Option<SendableStream>,
    pub device_name: String,
    pub config: AudioConfig,
    /// Position courante en frames (partagée avec le callback audio).
    pub position_frames: Arc<AtomicU64>,
    /// État de lecture (partagé avec le callback audio).
    pub is_playing: Arc<AtomicBool>,
}

impl AudioEngine {
    pub fn new() -> Self {
        match Self::try_init() {
            Ok(engine) => engine,
            Err(e) => {
                eprintln!("[AudioEngine] Initialisation échouée : {e}");
                Self {
                    command_sender: None,
                    _stream: None,
                    device_name: "none".to_string(),
                    config: AudioConfig::default(),
                    position_frames: Arc::new(AtomicU64::new(0)),
                    is_playing: Arc::new(AtomicBool::new(false)),
                }
            }
        }
    }

    fn try_init() -> Result<Self, Box<dyn std::error::Error>> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or("Aucun périphérique de sortie audio trouvé")?;

        let device_name = device.name().unwrap_or_else(|_| "inconnu".to_string());
        println!("[AudioEngine] Périphérique audio : {device_name}");

        let supported = device.default_output_config()?;
        let sample_rate = supported.sample_rate().0;
        let channels = supported.channels();
        println!("[AudioEngine] Config : {sample_rate} Hz, {channels} canaux");

        let stream_config = StreamConfig {
            channels,
            sample_rate: SampleRate(sample_rate),
            buffer_size: BufferSize::Default,
        };

        let rb = HeapRb::<AudioCommand>::new(512);
        let (prod, mut cons) = rb.split();

        let position_atomic = Arc::new(AtomicU64::new(0));
        let is_playing_atomic = Arc::new(AtomicBool::new(false));
        let position_atomic_cb = Arc::clone(&position_atomic);
        let is_playing_atomic_cb = Arc::clone(&is_playing_atomic);

        // Pré-allouer l'état du callback (pas d'allocation dans le callback lui-même).
        let mut samples: Vec<Option<SampleData>> = Vec::with_capacity(256);
        samples.resize_with(256, || None);

        let mut state = AudioCallbackState {
            master_volume: 1.0,
            is_playing: false,
            position_frames: 0,
            sample_rate,
            samples,
            pad_configs: [None; 16],
            pad_voices: Vec::with_capacity(128),
            preview_voice: None,
            clips: Vec::with_capacity(64),
            clip_voices: Vec::with_capacity(64),
            position_atomic: position_atomic_cb,
            is_playing_atomic: is_playing_atomic_cb,
        };

        let output_channels = channels as usize;

        let stream = device.build_output_stream(
            &stream_config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                // 1. Traiter les commandes en attente (lock-free, pas d'allocation).
                while let Some(cmd) = cons.try_pop() {
                    state.handle_command(cmd);
                }

                // 2. Vérifier les clips à démarrer avant de rendre les frames.
                if state.is_playing {
                    let total_frames = data.len() / output_channels;
                    for frame_offset in 0..total_frames as u64 {
                        let cur = state.position_frames + frame_offset;
                        for clip in &state.clips {
                            if clip.position_frames == cur {
                                // Eviter les doublons.
                                if !state.clip_voices.iter().any(|(id, _)| *id == clip.id) {
                                    if state.clip_voices.len() < 64 {
                                        state.clip_voices.push((
                                            clip.id,
                                            Voice { sample_id: clip.sample_id, position: 0 },
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }

                // 3. Rendre chaque frame.
                for chunk in data.chunks_mut(output_channels) {
                    let mut left = 0.0f32;
                    let mut right = 0.0f32;

                    // Voix de pads.
                    for voice in &mut state.pad_voices {
                        let (l, r) = voice.next_stereo(&state.samples);
                        left += l;
                        right += r;
                    }
                    state.pad_voices.retain(|v| !v.is_done(&state.samples));

                    // Voix de preview.
                    if let Some(ref mut pv) = state.preview_voice {
                        let (l, r) = pv.next_stereo(&state.samples);
                        left += l;
                        right += r;
                        if pv.is_done(&state.samples) {
                            state.preview_voice = None;
                        }
                    }

                    // Voix de clips (timeline).
                    if state.is_playing {
                        for (_, voice) in &mut state.clip_voices {
                            let (l, r) = voice.next_stereo(&state.samples);
                            left += l;
                            right += r;
                        }
                        state.clip_voices.retain(|(_, v)| !v.is_done(&state.samples));

                        state.position_frames += 1;
                        // Mise à jour atomique périodique (~chaque 512 frames).
                        if state.position_frames % 512 == 0 {
                            state.position_atomic.store(state.position_frames, Ordering::Relaxed);
                        }
                    }

                    // Clamp + volume master.
                    let out_l = (left * state.master_volume).clamp(-1.0, 1.0);
                    let out_r = (right * state.master_volume).clamp(-1.0, 1.0);

                    if output_channels >= 2 {
                        chunk[0] = out_l;
                        chunk[1] = out_r;
                    } else if output_channels == 1 {
                        chunk[0] = (out_l + out_r) * 0.5;
                    }
                }
            },
            |err| eprintln!("[AudioEngine] Erreur stream : {err}"),
            None,
        )?;

        stream.play()?;
        println!("[AudioEngine] Stream démarré.");

        let config = AudioConfig {
            sample_rate,
            buffer_size: 512,
            channels,
            bit_depth: 32,
        };

        Ok(Self {
            command_sender: Some(Arc::new(Mutex::new(prod))),
            _stream: Some(SendableStream(stream)),
            device_name,
            config,
            position_frames: position_atomic,
            is_playing: is_playing_atomic,
        })
    }

    /// Envoie une commande au thread audio. No-op si le moteur est désactivé.
    pub fn send_command(&self, cmd: AudioCommand) {
        if let Some(sender) = &self.command_sender {
            if let Ok(mut prod) = sender.lock() {
                if prod.try_push(cmd).is_err() {
                    eprintln!("[AudioEngine] Canal de commandes plein, commande ignorée.");
                }
            }
        }
    }

    pub fn is_active(&self) -> bool {
        self.command_sender.is_some()
    }

    /// Retourne la position courante en secondes.
    pub fn position_secs(&self) -> f64 {
        let frames = self.position_frames.load(Ordering::Relaxed);
        frames as f64 / self.config.sample_rate as f64
    }
}
