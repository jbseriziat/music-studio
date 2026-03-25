pub mod envelope;
pub mod filter;
pub mod lfo;
pub mod oscillator;
pub mod synth_engine;
pub mod voice;

pub use lfo::{LfoWaveform, ModDestination, LFO};
pub use synth_engine::{midi_note_to_freq, SynthEngine, SynthMode};

use oscillator::Waveform;
use serde::{Deserialize, Serialize};

/// Preset de synthétiseur : tous les paramètres sérialisables pour l'IPC et la sauvegarde.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthPreset {
    pub name: String,
    pub waveform: Waveform,
    pub octave_offset: i8,    // -2 à +2
    pub detune_cents: f32,    // -50 à +50
    pub attack: f32,          // secondes
    pub decay: f32,           // secondes
    pub sustain: f32,         // 0.0–1.0
    pub release: f32,         // secondes
    pub cutoff: f32,          // Hz
    pub resonance: f32,       // 0.0–1.0
    // ── Phase 5 ─────────────────────────────────────────────────────
    #[serde(default)]
    pub osc2_enabled: bool,
    #[serde(default)]
    pub osc2_waveform: Waveform,
    #[serde(default)]
    pub osc2_octave_offset: i8,
    #[serde(default)]
    pub osc2_detune_cents: f32,
    #[serde(default = "default_osc_mix")]
    pub osc_mix: f32,
}

fn default_osc_mix() -> f32 {
    0.5
}

impl Default for SynthPreset {
    fn default() -> Self {
        Self {
            name: "Default".to_string(),
            waveform: Waveform::Sine,
            octave_offset: 0,
            detune_cents: 0.0,
            attack: 0.010,
            decay: 0.100,
            sustain: 0.7,
            release: 0.200,
            cutoff: 8000.0,
            resonance: 0.0,
            osc2_enabled: false,
            osc2_waveform: Waveform::Sine,
            osc2_octave_offset: 0,
            osc2_detune_cents: 0.0,
            osc_mix: 0.5,
        }
    }
}

/// Presets intégrés : 6 classiques (Phase 3) + 4 avancés (Phase 5).
pub fn get_builtin_presets() -> Vec<SynthPreset> {
    vec![
        SynthPreset {
            name: "Piano doux".to_string(),
            waveform: Waveform::Sine,
            attack: 0.005,
            decay: 0.300,
            sustain: 0.3,
            release: 0.500,
            cutoff: 4000.0,
            ..Default::default()
        },
        SynthPreset {
            name: "Orgue rétro".to_string(),
            waveform: Waveform::Square,
            attack: 0.010,
            decay: 0.050,
            sustain: 0.8,
            release: 0.100,
            cutoff: 6000.0,
            ..Default::default()
        },
        SynthPreset {
            name: "Flûte magique".to_string(),
            waveform: Waveform::Sine,
            octave_offset: 1,
            attack: 0.050,
            decay: 0.200,
            sustain: 0.6,
            release: 0.300,
            cutoff: 3000.0,
            ..Default::default()
        },
        SynthPreset {
            name: "Robot".to_string(),
            waveform: Waveform::Square,
            attack: 0.001,
            decay: 0.100,
            sustain: 0.5,
            release: 0.050,
            cutoff: 2000.0,
            resonance: 0.6,
            ..Default::default()
        },
        SynthPreset {
            name: "Sous-marin".to_string(),
            waveform: Waveform::Triangle,
            octave_offset: -1,
            attack: 0.100,
            decay: 0.500,
            sustain: 0.4,
            release: 1.000,
            cutoff: 800.0,
            ..Default::default()
        },
        SynthPreset {
            name: "Étoile".to_string(),
            waveform: Waveform::Triangle,
            octave_offset: 1,
            attack: 0.010,
            decay: 1.000,
            sustain: 0.0,
            release: 0.100,
            cutoff: 10000.0,
            ..Default::default()
        },
        // ── Phase 5 : presets utilisant le double oscillateur ────────
        SynthPreset {
            name: "Super Saw".to_string(),
            waveform: Waveform::Sawtooth,
            attack: 0.010,
            decay: 0.200,
            sustain: 0.7,
            release: 0.300,
            cutoff: 6000.0,
            resonance: 0.1,
            osc2_enabled: true,
            osc2_waveform: Waveform::Sawtooth,
            osc2_detune_cents: 12.0,
            osc_mix: 0.5,
            ..Default::default()
        },
        SynthPreset {
            name: "Thick Bass".to_string(),
            waveform: Waveform::Sawtooth,
            octave_offset: -1,
            attack: 0.005,
            decay: 0.150,
            sustain: 0.6,
            release: 0.100,
            cutoff: 1200.0,
            resonance: 0.3,
            osc2_enabled: true,
            osc2_waveform: Waveform::Square,
            osc_mix: 0.4,
            ..Default::default()
        },
        SynthPreset {
            name: "Space Pad".to_string(),
            waveform: Waveform::Triangle,
            attack: 0.500,
            decay: 0.800,
            sustain: 0.5,
            release: 2.000,
            cutoff: 3000.0,
            resonance: 0.2,
            osc2_enabled: true,
            osc2_waveform: Waveform::Sine,
            osc2_octave_offset: 1,
            osc2_detune_cents: 7.0,
            osc_mix: 0.3,
            ..Default::default()
        },
        SynthPreset {
            name: "Noise FX".to_string(),
            waveform: Waveform::Noise,
            attack: 0.050,
            decay: 0.300,
            sustain: 0.0,
            release: 0.500,
            cutoff: 2000.0,
            resonance: 0.5,
            ..Default::default()
        },
    ]
}
