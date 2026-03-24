pub mod envelope;
pub mod filter;
pub mod oscillator;
pub mod synth_engine;
pub mod voice;

pub use synth_engine::{midi_note_to_freq, SynthEngine};

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
        }
    }
}

/// 6 presets intégrés adaptés aux enfants.
pub fn get_builtin_presets() -> Vec<SynthPreset> {
    vec![
        SynthPreset {
            name: "Piano doux".to_string(),
            waveform: Waveform::Sine,
            octave_offset: 0,
            detune_cents: 0.0,
            attack: 0.005,
            decay: 0.300,
            sustain: 0.3,
            release: 0.500,
            cutoff: 4000.0,
            resonance: 0.0,
        },
        SynthPreset {
            name: "Orgue rétro".to_string(),
            waveform: Waveform::Square,
            octave_offset: 0,
            detune_cents: 0.0,
            attack: 0.010,
            decay: 0.050,
            sustain: 0.8,
            release: 0.100,
            cutoff: 6000.0,
            resonance: 0.0,
        },
        SynthPreset {
            name: "Flûte magique".to_string(),
            waveform: Waveform::Sine,
            octave_offset: 1,
            detune_cents: 0.0,
            attack: 0.050,
            decay: 0.200,
            sustain: 0.6,
            release: 0.300,
            cutoff: 3000.0,
            resonance: 0.0,
        },
        SynthPreset {
            name: "Robot".to_string(),
            waveform: Waveform::Square,
            octave_offset: 0,
            detune_cents: 0.0,
            attack: 0.001,
            decay: 0.100,
            sustain: 0.5,
            release: 0.050,
            cutoff: 2000.0,
            resonance: 0.6,
        },
        SynthPreset {
            name: "Sous-marin".to_string(),
            waveform: Waveform::Triangle,
            octave_offset: -1,
            detune_cents: 0.0,
            attack: 0.100,
            decay: 0.500,
            sustain: 0.4,
            release: 1.000,
            cutoff: 800.0,
            resonance: 0.0,
        },
        SynthPreset {
            name: "Étoile".to_string(),
            waveform: Waveform::Triangle,
            octave_offset: 1,
            detune_cents: 0.0,
            attack: 0.010,
            decay: 1.000,
            sustain: 0.0,
            release: 0.100,
            cutoff: 10000.0,
            resonance: 0.0,
        },
    ]
}
