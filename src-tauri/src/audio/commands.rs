use std::sync::Arc;

use crate::effects::BoxedEffect;

/// Wrapper autour de `ringbuf::HeapProd<f32>` implémentant `Debug` pour être
/// utilisé dans `AudioCommand` (qui dérive `Debug`).
/// Le champ `.0` est accédé par move dans `engine.rs::handle_command`.
#[allow(dead_code)]
pub struct SynthProducer(pub ringbuf::HeapProd<f32>);
impl std::fmt::Debug for SynthProducer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "SynthProducer")
    }
}

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

    // ── Synthétiseur (pistes Instrument) ─────────────────────────────────────

    /// Initialise un slot de synthé pour cette piste (sans allocation : le slot est pré-alloué).
    CreateSynthTrack { track_id: u32 },

    /// Déclenche une note sur la piste instrument donnée.
    NoteOn { track_id: u32, note: u8, velocity: u8 },

    /// Relâche une note sur la piste instrument donnée.
    NoteOff { track_id: u32, note: u8 },

    /// Met à jour un paramètre du synthé d'une piste (sans String : enum compact).
    SetSynthParam { track_id: u32, param: SynthParam, value: f32 },

    /// Charge un preset entier sur la piste instrument donnée.
    LoadSynthPreset { track_id: u32, preset: crate::synth::SynthPreset },

    // ── MIDI clips (piano roll) ───────────────────────────────────────────────

    /// Ajoute (ou remplace) un clip MIDI sur la piste instrument.
    AddMidiClip { track_id: u32, clip: crate::midi::MidiClip },

    /// Remplace toutes les notes d'un clip MIDI (opération batch depuis le piano roll).
    UpdateMidiClipNotes { track_id: u32, clip_id: u32, notes: Vec<crate::midi::MidiNote> },

    /// Supprime un clip MIDI d'une piste instrument.
    DeleteMidiClip { track_id: u32, clip_id: u32 },

    /// Efface tous les clips MIDI d'une piste (nouveau projet, chargement).
    ClearMidiClips { track_id: u32 },

    // ── Mixer : volume, panoramique ───────────────────────────────────────────

    /// Règle le volume linéaire d'une piste (0.0 = silence, 1.0 = nominal, > 1.0 = gain).
    SetTrackVolume { track_id: u32, volume: f32 },

    /// Règle le panoramique d'une piste (-1.0 = gauche, 0.0 = centre, +1.0 = droite).
    SetTrackPan { track_id: u32, pan: f32 },

    /// Enregistre l'identifiant numérique de la piste Drum Rack (pour le metering).
    SetDrumRackTrackId { track_id: u32 },

    // ── Effets (insert chain par piste) ──────────────────────────────────────

    /// Ajoute un effet à la chaîne d'une piste (ID généré côté thread principal).
    AddEffect { track_id: u32, effect_id: u32, effect: BoxedEffect },

    /// Supprime un effet de la chaîne d'une piste.
    RemoveEffect { track_id: u32, effect_id: u32 },

    /// Définit un paramètre d'un effet.
    SetEffectParam { track_id: u32, effect_id: u32, param: String, value: f32 },

    /// Active/désactive le bypass d'un effet.
    SetEffectBypass { track_id: u32, effect_id: u32, bypass: bool },

    // ── Automation ────────────────────────────────────────────────────────────

    /// Remplace la lane d'automation d'un paramètre pour une piste.
    /// `points` est trié par beats croissant ; l'allocation vient du thread principal.
    SetAutomationPoints {
        track_id: u32,
        param: crate::audio::automation::AutomationParam,
        /// Paires (beats, valeur_normalisée 0.0–1.0) triées par beats.
        points: Vec<(f64, f32)>,
    },

    // ── Enregistrement du synthé (capture interne, sans micro) ───────────────

    /// Envoie le producteur du ring buffer au callback pour capturer la sortie
    /// du synthé de `track_id`. Le callback pousse des échantillons stéréo
    /// entrelacés (L, R, L, R…) via `try_push` (lock-free, jamais bloquant).
    SetSynthRecordProducer {
        track_id: u32,
        producer: SynthProducer,
    },

    /// Arrête la capture synthé : le callback drop son `HeapProd`, ce qui
    /// ferme le ring buffer côté producteur.
    ClearSynthRecord,

    // ── Matrice de modulation (Phase 5.2) ────────────────────────────────────

    /// Ajoute un routage de modulation au synthé d'une piste.
    AddModRoute {
        track_id: u32,
        route_id: u32,
        source: u32,      // ModSource index
        destination: u32,  // ModDestination index
        amount: f32,
    },

    /// Met à jour l'intensité d'un routage existant.
    UpdateModRoute { track_id: u32, route_id: u32, amount: f32 },

    /// Supprime un routage de modulation.
    RemoveModRoute { track_id: u32, route_id: u32 },

    // ── Master Chain (Phase 5.3) ─────────────────────────────────────────────

    /// Active/désactive la chaîne de mastering.
    SetMasterChainEnabled { enabled: bool },

    /// Règle une bande de l'EQ master (0–4).
    SetMasterEqBand { band: u8, gain_db: f32, freq: f32, q: f32 },

    /// Règle le threshold du limiteur (en dB, -12 à 0).
    SetLimiterThreshold { threshold_db: f32 },

    /// Active/désactive le limiteur.
    SetLimiterEnabled { enabled: bool },

    /// Reset le LUFS meter (nouveau morceau / repositionnement).
    ResetLufs,

    // ── Bus d'effets Send/Return (Phase 5.4) ─────────────────────────────────

    /// Crée un bus d'effets.
    CreateBus { bus_id: u32, name: String },

    /// Supprime un bus d'effets.
    DeleteBus { bus_id: u32 },

    /// Ajoute un effet à un bus (même système que les effets de piste).
    AddBusEffect { bus_id: u32, effect_id: u32, effect: crate::effects::BoxedEffect },

    /// Règle le volume d'un bus.
    SetBusVolume { bus_id: u32, volume: f32 },

    /// Règle le send amount d'une piste vers un bus.
    SetSendAmount { track_id: u32, bus_id: u32, amount: f32 },

    // ── Track Groups (Phase 5.5) ─────────────────────────────────────────────

    /// Crée un groupe de pistes.
    CreateTrackGroup { group_id: u32, track_ids: Vec<u32> },

    /// Supprime (dissout) un groupe.
    DissolveTrackGroup { group_id: u32 },

    /// Règle le volume du groupe (multiplicateur appliqué à toutes les pistes enfants).
    SetGroupVolume { group_id: u32, volume: f32 },
}

/// Paramètre de synthé encodé comme enum (pas de String → pas d'allocation/déallocation dans le callback).
/// Conversion depuis les chaînes JS dans les commandes Tauri.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SynthParam {
    Waveform,
    Attack,
    Decay,
    Sustain,
    Release,
    Cutoff,
    Resonance,
    Octave,
    Detune,
    Volume,
    // ── Phase 5 ─────────────────────────────────────────────────────
    Osc2Enabled,
    Osc2Waveform,
    Osc2Octave,
    Osc2Detune,
    OscMix,
    Lfo1Waveform,
    Lfo1Rate,
    Lfo1Depth,
    Lfo1Destination,
    Lfo1Sync,
    Lfo2Waveform,
    Lfo2Rate,
    Lfo2Depth,
    Lfo2Destination,
    Lfo2Sync,
    SynthMode,
    GlideTime,
    // ── Phase 5.2 ───────────────────────────────────────────────────
    FilterType,
    Drive,
    FilterEnvAmount,
    FilterEnvAttack,
    FilterEnvDecay,
    FilterEnvSustain,
    FilterEnvRelease,
}

impl SynthParam {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "waveform"         => Some(Self::Waveform),
            "attack"           => Some(Self::Attack),
            "decay"            => Some(Self::Decay),
            "sustain"          => Some(Self::Sustain),
            "release"          => Some(Self::Release),
            "cutoff"           => Some(Self::Cutoff),
            "resonance"        => Some(Self::Resonance),
            "octave"           => Some(Self::Octave),
            "detune"           => Some(Self::Detune),
            "volume"           => Some(Self::Volume),
            "osc2_enabled"     => Some(Self::Osc2Enabled),
            "osc2_waveform"    => Some(Self::Osc2Waveform),
            "osc2_octave"      => Some(Self::Osc2Octave),
            "osc2_detune"      => Some(Self::Osc2Detune),
            "osc_mix"          => Some(Self::OscMix),
            "lfo1_waveform"    => Some(Self::Lfo1Waveform),
            "lfo1_rate"        => Some(Self::Lfo1Rate),
            "lfo1_depth"       => Some(Self::Lfo1Depth),
            "lfo1_destination" => Some(Self::Lfo1Destination),
            "lfo1_sync"        => Some(Self::Lfo1Sync),
            "lfo2_waveform"    => Some(Self::Lfo2Waveform),
            "lfo2_rate"        => Some(Self::Lfo2Rate),
            "lfo2_depth"       => Some(Self::Lfo2Depth),
            "lfo2_destination" => Some(Self::Lfo2Destination),
            "lfo2_sync"        => Some(Self::Lfo2Sync),
            "synth_mode"       => Some(Self::SynthMode),
            "glide_time"       => Some(Self::GlideTime),
            "filter_type"      => Some(Self::FilterType),
            "drive"            => Some(Self::Drive),
            "filter_env_amount"  => Some(Self::FilterEnvAmount),
            "filter_env_attack"  => Some(Self::FilterEnvAttack),
            "filter_env_decay"   => Some(Self::FilterEnvDecay),
            "filter_env_sustain" => Some(Self::FilterEnvSustain),
            "filter_env_release" => Some(Self::FilterEnvRelease),
            _                  => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Waveform         => "waveform",
            Self::Attack           => "attack",
            Self::Decay            => "decay",
            Self::Sustain          => "sustain",
            Self::Release          => "release",
            Self::Cutoff           => "cutoff",
            Self::Resonance        => "resonance",
            Self::Octave           => "octave",
            Self::Detune           => "detune",
            Self::Volume           => "volume",
            Self::Osc2Enabled      => "osc2_enabled",
            Self::Osc2Waveform     => "osc2_waveform",
            Self::Osc2Octave       => "osc2_octave",
            Self::Osc2Detune       => "osc2_detune",
            Self::OscMix           => "osc_mix",
            Self::Lfo1Waveform     => "lfo1_waveform",
            Self::Lfo1Rate         => "lfo1_rate",
            Self::Lfo1Depth        => "lfo1_depth",
            Self::Lfo1Destination  => "lfo1_destination",
            Self::Lfo1Sync         => "lfo1_sync",
            Self::Lfo2Waveform     => "lfo2_waveform",
            Self::Lfo2Rate         => "lfo2_rate",
            Self::Lfo2Depth        => "lfo2_depth",
            Self::Lfo2Destination  => "lfo2_destination",
            Self::Lfo2Sync         => "lfo2_sync",
            Self::SynthMode        => "synth_mode",
            Self::GlideTime        => "glide_time",
            Self::FilterType       => "filter_type",
            Self::Drive            => "drive",
            Self::FilterEnvAmount  => "filter_env_amount",
            Self::FilterEnvAttack  => "filter_env_attack",
            Self::FilterEnvDecay   => "filter_env_decay",
            Self::FilterEnvSustain => "filter_env_sustain",
            Self::FilterEnvRelease => "filter_env_release",
        }
    }
}
