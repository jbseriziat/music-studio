use std::sync::Arc;

/// Commandes envoyées depuis le thread principal vers le thread audio (canal lock-free).
/// Les variants Arc<Vec<f32>> transfèrent la propriété via ringbuf — pas d'allocation dans le callback.
#[derive(Debug)]
pub enum AudioCommand {
    // ── Transport ────────────────────────────────────────────────────────────
    Play,
    Pause,
    Stop,
    SetPosition { frames: u64 },
    SetMasterVolume(f32),

    // ── Boucle ───────────────────────────────────────────────────────────────
    /// Configure la zone de boucle de la timeline (en frames audio).
    SetLoop { enabled: bool, start_frames: u64, end_frames: u64 },

    // ── Samples ──────────────────────────────────────────────────────────────
    /// Charge un sample dans la banque de l'audio thread.
    LoadSample {
        id: u32,
        data: Arc<Vec<f32>>,
        channels: u16,
        sample_rate: u32,
    },

    // ── Pads ─────────────────────────────────────────────────────────────────
    AssignPad { pad_id: u8, sample_id: Option<u32> },
    TriggerPad { pad_id: u8 },

    // ── Prévisualisation ──────────────────────────────────────────────────────
    PreviewSample { id: u32 },
    StopPreview,

    // ── Timeline clips ────────────────────────────────────────────────────────
    AddClip {
        id: u32,
        sample_id: u32,
        position_frames: u64,
        duration_frames: u64,
        /// Index numérique de la piste (0-based) pour le mute/solo.
        track_id: u32,
    },
    MoveClip {
        id: u32,
        new_position_frames: u64,
    },
    DeleteClip { id: u32 },

    /// Supprime tous les clips de la timeline (nouveau projet / chargement).
    ClearTimeline,

    // ── Pistes : Mute / Solo ──────────────────────────────────────────────────
    /// Active/désactive le mute d'une piste (track_id = index numérique 0-based).
    SetTrackMute { track_id: u32, muted: bool },
    /// Active/désactive le solo d'une piste.
    SetTrackSolo { track_id: u32, solo: bool },

    // ── BPM & Drum Sequencer ──────────────────────────────────────────────────
    /// Met à jour le tempo (BPM). Recalcule immédiatement la durée d'un step.
    SetBpm { bpm: f64 },

    /// Active/désactive et ajuste la vélocité d'un step individuel.
    SetDrumStep { pad: u8, step: u8, active: bool, velocity: f32 },

    /// Assigne un sample à un pad du drum rack.
    AssignDrumPad { pad: u8, sample_id: u32 },

    /// Déclenche immédiatement la lecture d'un pad du drum rack.
    TriggerDrumPad { pad: u8 },

    /// Active/désactive le métronome.
    SetMetronome { enabled: bool },

    /// Ajuste le volume du métronome (0.0–1.0).
    SetMetronomeVolume { volume: f32 },

    /// Modifie le nombre de steps du pattern (8, 16, 32).
    SetDrumStepCount { count: u8 },

    /// Remplace tout le pattern d'un coup (chargement de projet, preset).
    SetDrumPattern { pattern: crate::drums::DrumPattern },

    /// Ajuste le volume d'un pad du drum rack (0.0–2.0). Applied at trigger time.
    SetDrumPadVolume { pad: u8, volume: f32 },

    /// Transpose un pad du drum rack en demi-tons (−12 à +12).
    SetDrumPadPitch { pad: u8, pitch_semitones: f32 },
}
