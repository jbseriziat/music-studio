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
    },
    MoveClip {
        id: u32,
        new_position_frames: u64,
    },
    DeleteClip { id: u32 },

    /// Supprime tous les clips de la timeline (nouveau projet / chargement).
    ClearTimeline,
}
