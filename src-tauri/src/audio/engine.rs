use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, SampleRate, StreamConfig};
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapRb,
};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering},
    Arc, Mutex,
};

use super::commands::AudioCommand;
use super::config::AudioConfig;
use crate::effects::EffectChain;
use crate::midi::MidiClip;
use crate::mixer::{MeterReport, TrackMeterData};
use crate::synth::SynthEngine;
use crate::transport::Metronome;

/// Nombre maximal de pistes synthétiseur simultanées.
const MAX_SYNTH_TRACKS: usize = 4;
/// Valeur sentinelle : aucune piste assignée à ce slot.
const NO_TRACK: u32 = u32::MAX;
/// Intervalle de calcul des VU-mètres en frames (~33ms à 48kHz).
const METER_INTERVAL_FRAMES: u32 = 1600;

/// ID réservé pour le sample de click métronome accent (premier temps).
const METRO_ACCENT_ID: u32 = 253;
/// ID réservé pour le sample de click métronome normal.
const METRO_CLICK_ID: u32 = 254;

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

// ─── Une voix de lecture (pad, clip ou drum) ─────────────────────────────────
struct Voice {
    sample_id: u32,
    /// Position en frames (index dans SampleData::frames / channels).
    position: usize,
    /// Facteur de vélocité (0.0 – 1.0). 1.0 = volume nominal.
    velocity: f32,
}

impl Voice {
    /// Lit la prochaine frame stéréo, avec application de la vélocité.
    /// Retourne (0.0, 0.0) si le sample est inconnu ou terminé.
    fn next_stereo(&mut self, samples: &[Option<SampleData>]) -> (f32, f32) {
        let Some(Some(sd)) = samples.get(self.sample_id as usize) else {
            return (0.0, 0.0);
        };
        let num_frames = sd.frames.len() / sd.channels as usize;
        if self.position >= num_frames {
            return (0.0, 0.0);
        }
        let base = self.position * sd.channels as usize;
        let l = sd.frames[base] * self.velocity;
        let r = if sd.channels > 1 { sd.frames[base + 1] * self.velocity } else { l };
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

// ─── Voix de drum rack avec pitch (interpolation linéaire) ───────────────────
struct PitchedVoice {
    sample_id: u32,
    /// Position fractionnaire dans le sample (avance de `pitch_ratio` par frame).
    position: f64,
    /// Facteur de vélocité × volume du pad (0.0–2.0).
    velocity: f32,
    /// 2^(semitones/12) — 1.0 = normal, 2.0 = +1 octave, 0.5 = −1 octave.
    pitch_ratio: f64,
}

impl PitchedVoice {
    fn next_stereo(&mut self, samples: &[Option<SampleData>]) -> (f32, f32) {
        let Some(Some(sd)) = samples.get(self.sample_id as usize) else {
            return (0.0, 0.0);
        };
        let num_frames = sd.frames.len() / sd.channels as usize;
        let ipos = self.position as usize;
        if ipos >= num_frames {
            return (0.0, 0.0);
        }
        let frac = (self.position - ipos as f64) as f32;
        let base = ipos * sd.channels as usize;
        let next_base = if ipos + 1 < num_frames {
            (ipos + 1) * sd.channels as usize
        } else {
            base
        };
        let l = (sd.frames[base]     + (sd.frames[next_base]     - sd.frames[base])     * frac) * self.velocity;
        let r = if sd.channels > 1 {
            let b1 = base + 1;
            let n1 = next_base + 1;
            (sd.frames[b1] + (sd.frames[n1] - sd.frames[b1]) * frac) * self.velocity
        } else {
            l
        };
        self.position += self.pitch_ratio;
        (l, r)
    }

    fn is_done(&self, samples: &[Option<SampleData>]) -> bool {
        match samples.get(self.sample_id as usize) {
            Some(Some(sd)) => {
                self.position as usize >= sd.frames.len() / sd.channels as usize
            }
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
    /// Index numérique de la piste (0-based). Utilisé pour le mute/solo.
    track_id: u32,
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

    // ─── BPM & Drum Sequencer ─────────────────────────────────────────────────
    /// Tempo actuel en BPM.
    bpm: f64,
    /// Durée d'un step en samples (= sample_rate * 60 / (bpm * 4)).
    samples_per_step: f64,
    /// Compteur de samples depuis le début du step courant.
    sequencer_counter: f64,
    /// Index du step actuel (0..drum_pattern_steps).
    sequencer_step: usize,
    /// Nombre de steps dans le pattern (8, 16 ou 32).
    drum_pattern_steps: usize,
    /// Étapes actives : drum_pad_steps[pad][step].
    drum_pad_steps: [[bool; 32]; 8],
    /// Vélocités par step : drum_pad_velocities[pad][step] (0.0–1.0).
    drum_pad_velocities: [[f32; 32]; 8],
    /// Sample assigné à chaque pad du drum rack (index 0–7).
    drum_pad_samples: [u32; 8],
    /// Volume par pad (0.0–2.0). Multiplié à la vélocité au déclenchement.
    drum_pad_volumes: [f32; 8],
    /// Transposition en demi-tons par pad (−12.0 à +12.0).
    drum_pad_pitches: [f32; 8],
    /// Voix de drum rack actives (avec pitch). Pré-alloué à 64.
    drum_voices: Vec<PitchedVoice>,

    // ─── Métronome ────────────────────────────────────────────────────────────
    metronome_enabled: bool,
    /// Volume du métronome (0.0–1.0). Indépendant du volume master.
    metronome_volume: f32,
    /// Voix du click métronome en cours.
    metronome_voice: Option<Voice>,

    // ─── Boucle ───────────────────────────────────────────────────────────────
    loop_enabled: bool,
    loop_start_frames: u64,
    loop_end_frames: u64,

    // ─── Mute / Solo par piste ────────────────────────────────────────────────
    /// Tableau fixe [bool; 64], indexé par track_id % 64.
    track_muted: [bool; 64],
    track_solo: [bool; 64],
    /// Cache : vrai si au moins une piste est en solo.
    any_track_solo: bool,

    // ─── Volume / Panoramique par piste ───────────────────────────────────────
    /// Volume linéaire par piste (1.0 = nominal). Indexé par track_id % 64.
    track_volumes: [f32; 64],
    /// Panoramique par piste (-1.0 gauche, 0.0 centre, +1.0 droite). Indexé par track_id % 64.
    track_pans: [f32; 64],
    /// ID de la piste Drum Rack (pour le metering). NO_TRACK si non assigné.
    drum_rack_track_id: u32,

    // ─── Metering VU-mètre ────────────────────────────────────────────────────
    /// Peak accumulé par slot (track_id % 64) — remis à 0 après chaque rapport.
    track_peak_l: [f32; 64],
    track_peak_r: [f32; 64],
    /// Somme des carrés (RMS) par slot.
    track_rms_sum_l: [f64; 64],
    track_rms_sum_r: [f64; 64],
    /// Nombre de samples accumulés par slot.
    track_rms_count: [u32; 64],
    /// Track ID réel pour chaque slot (NO_TRACK = inactif).
    track_known_ids: [u32; 64],
    /// Peak master accumulé.
    master_peak_l: f32,
    master_peak_r: f32,
    master_rms_sum_l: f64,
    master_rms_sum_r: f64,
    master_rms_count: u32,
    /// Compteur de frames depuis le dernier rapport de VU-mètres.
    meter_frame_count: u32,
    /// Rapport de VU-mètres partagé avec le thread principal (try_lock dans le callback).
    meter_report: Arc<Mutex<MeterReport>>,

    // ─── Synthétiseur (pistes Instrument) ─────────────────────────────────────
    /// Pool de MAX_SYNTH_TRACKS moteurs synthé pré-alloués.
    synth_engines: Vec<SynthEngine>,
    /// Track ID associé à chaque slot (NO_TRACK = libre).
    synth_track_ids: Vec<u32>,
    /// MIDI clips par slot de synthé (piano roll). Un Vec<MidiClip> par slot.
    midi_clips: Vec<Vec<MidiClip>>,

    // ─── Chaînes d'effets (insert) par piste ──────────────────────────────────
    /// 64 chaînes, indexées par track_id % 64. Pré-allouées, vides par défaut.
    effect_chains: Vec<EffectChain>,

    // ─── Automation par piste ──────────────────────────────────────────────────
    /// Volume automatisé : paires (beats, valeur 0.0–1.0) triées. Index = track_id % 64.
    automation_volume: Vec<Vec<(f64, f32)>>,
    /// Panoramique automatisé : paires (beats, valeur 0.0–1.0) triées. Index = track_id % 64.
    automation_pan: Vec<Vec<(f64, f32)>>,

    // ─── Enregistrement du synthé (capture lock-free) ────────────────────────
    /// ID de la piste synthé dont on capture la sortie. `None` = pas d'enregistrement.
    synth_record_track_id: Option<u32>,
    /// Producteur du ring buffer vers le thread d'écriture WAV. `None` = pas d'enregistrement.
    synth_record_producer: Option<ringbuf::HeapProd<f32>>,

    // ─── Atomics partagés avec le thread principal ────────────────────────────
    position_atomic: Arc<AtomicU64>,
    is_playing_atomic: Arc<AtomicBool>,
    /// Step courant du séquenceur (pour l'UI).
    current_step_atomic: Arc<AtomicU8>,
    /// BPM courant stocké comme bits f64 (pour lecture sans lock depuis le thread principal).
    bpm_atomic: Arc<AtomicU64>,
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
                self.drum_voices.clear();
                // Réinitialiser le séquenceur au step 0.
                self.sequencer_step = 0;
                self.sequencer_counter = 0.0;
                self.current_step_atomic.store(0, Ordering::Relaxed);
                self.metronome_voice = None;
                // Silence les synthés pour éviter les notes coincées des clips MIDI.
                for eng in &mut self.synth_engines {
                    eng.reset();
                }
                self.is_playing_atomic.store(false, Ordering::Relaxed);
                self.position_atomic.store(0, Ordering::Relaxed);
            }
            AudioCommand::SetPosition { frames } => {
                self.position_frames = frames;
                self.clip_voices.clear();
                self.position_atomic.store(frames, Ordering::Relaxed);
                // Silence les synthés pour éviter les notes coincées des clips MIDI.
                for eng in &mut self.synth_engines {
                    eng.reset();
                }
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
                        self.pad_voices.push(Voice { sample_id, position: 0, velocity: 1.0 });
                    }
                }
            }
            AudioCommand::PreviewSample { id } => {
                self.preview_voice = Some(Voice { sample_id: id, position: 0, velocity: 1.0 });
            }
            AudioCommand::StopPreview => {
                self.preview_voice = None;
            }
            AudioCommand::AddClip { id, sample_id, position_frames, duration_frames, track_id } => {
                // Retirer un clip existant avec le même id si présent.
                self.clips.retain(|c| c.id != id);
                self.clips.push(TimelineClip { id, sample_id, position_frames, duration_frames, track_id });
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
                self.drum_voices.clear();
                for clips in &mut self.midi_clips {
                    clips.clear();
                }
                self.sequencer_step = 0;
                self.sequencer_counter = 0.0;
                self.current_step_atomic.store(0, Ordering::Relaxed);
                self.position_frames = 0;
                self.is_playing = false;
                self.is_playing_atomic.store(false, Ordering::Relaxed);
                self.position_atomic.store(0, Ordering::Relaxed);
                for eng in &mut self.synth_engines {
                    eng.reset();
                }
            }

            // ── BPM & Drum Sequencer ─────────────────────────────────────────────
            AudioCommand::SetBpm { bpm } => {
                self.bpm = bpm.clamp(20.0, 300.0);
                // samples_per_step = SR * 60 / (bpm * 4) pour du 1/16 à 4/4
                self.samples_per_step = (self.sample_rate as f64 * 60.0) / (self.bpm * 4.0);
                self.bpm_atomic.store(self.bpm.to_bits(), Ordering::Relaxed);
            }
            AudioCommand::SetDrumStep { pad, step, active, velocity } => {
                let p = pad as usize;
                let s = step as usize;
                if p < 8 && s < 32 {
                    self.drum_pad_steps[p][s] = active;
                    self.drum_pad_velocities[p][s] = velocity.clamp(0.0, 1.0);
                }
            }
            AudioCommand::AssignDrumPad { pad, sample_id } => {
                if (pad as usize) < 8 {
                    self.drum_pad_samples[pad as usize] = sample_id;
                }
            }
            AudioCommand::TriggerDrumPad { pad } => {
                let p = pad as usize;
                if p < 8 && self.drum_voices.len() < 64 {
                    let sample_id = self.drum_pad_samples[p];
                    let velocity  = self.drum_pad_volumes[p].clamp(0.0, 2.0);
                    let pitch_ratio = 2.0f64.powf(self.drum_pad_pitches[p] as f64 / 12.0);
                    self.drum_voices.push(PitchedVoice { sample_id, position: 0.0, velocity, pitch_ratio });
                }
            }
            AudioCommand::SetDrumPadVolume { pad, volume } => {
                if (pad as usize) < 8 {
                    self.drum_pad_volumes[pad as usize] = volume.clamp(0.0, 2.0);
                }
            }
            AudioCommand::SetDrumPadPitch { pad, pitch_semitones } => {
                if (pad as usize) < 8 {
                    self.drum_pad_pitches[pad as usize] = pitch_semitones.clamp(-12.0, 12.0);
                }
            }
            AudioCommand::SetMetronome { enabled } => {
                self.metronome_enabled = enabled;
                if !enabled {
                    self.metronome_voice = None;
                }
            }
            AudioCommand::SetMetronomeVolume { volume } => {
                self.metronome_volume = volume.clamp(0.0, 1.0);
            }
            AudioCommand::SetLoop { enabled, start_frames, end_frames } => {
                self.loop_enabled = enabled;
                self.loop_start_frames = start_frames;
                self.loop_end_frames = end_frames;
            }
            AudioCommand::SetTrackMute { track_id, muted } => {
                let idx = (track_id % 64) as usize;
                self.track_muted[idx] = muted;
            }
            AudioCommand::SetTrackSolo { track_id, solo } => {
                let idx = (track_id % 64) as usize;
                self.track_solo[idx] = solo;
                // Recalculer le cache any_track_solo.
                self.any_track_solo = self.track_solo.iter().any(|&s| s);
            }
            AudioCommand::SetDrumStepCount { count } => {
                let c = (count as usize).max(1).min(32);
                self.drum_pattern_steps = c;
                // Si le step courant dépasse la nouvelle longueur, on le remet à 0.
                if self.sequencer_step >= c {
                    self.sequencer_step = 0;
                    self.sequencer_counter = 0.0;
                }
            }
            AudioCommand::SetDrumPattern { pattern } => {
                self.drum_pattern_steps = (pattern.steps as usize).max(1).min(32);
                // Réinitialiser toutes les cases.
                for p in 0..8 {
                    for s in 0..32 {
                        self.drum_pad_steps[p][s] = false;
                        self.drum_pad_velocities[p][s] = 1.0;
                    }
                }
                // Copier les données du pattern reçu.
                for (p, pad_steps) in pattern.pads.iter().enumerate().take(8) {
                    for (s, &active) in pad_steps.iter().enumerate().take(self.drum_pattern_steps) {
                        self.drum_pad_steps[p][s] = active;
                    }
                }
                for (p, pad_vels) in pattern.velocities.iter().enumerate().take(8) {
                    for (s, &vel) in pad_vels.iter().enumerate().take(self.drum_pattern_steps) {
                        self.drum_pad_velocities[p][s] = vel.clamp(0.0, 1.0);
                    }
                }
                // Réinitialiser le séquenceur si hors limites.
                if self.sequencer_step >= self.drum_pattern_steps {
                    self.sequencer_step = 0;
                    self.sequencer_counter = 0.0;
                }
            }

            // ── Synthétiseur ─────────────────────────────────────────────────
            AudioCommand::CreateSynthTrack { track_id } => {
                // Si la piste est déjà assignée, on la réinitialise.
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    self.synth_engines[slot].reset();
                } else if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == NO_TRACK) {
                    self.synth_track_ids[slot] = track_id;
                    self.synth_engines[slot].reset();
                }
                // Si tous les slots sont occupés, on ignore silencieusement.
            }
            AudioCommand::NoteOn { track_id, note, velocity } => {
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    self.synth_engines[slot].note_on(note, velocity);
                }
            }
            AudioCommand::NoteOff { track_id, note } => {
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    self.synth_engines[slot].note_off(note);
                }
            }
            AudioCommand::SetSynthParam { track_id, param, value } => {
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    self.synth_engines[slot].set_param(param.as_str(), value);
                }
            }
            AudioCommand::LoadSynthPreset { track_id, preset } => {
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    self.synth_engines[slot].apply_preset(&preset);
                }
                // preset (contenant une String) est dropé ici depuis le callback —
                // cohérent avec SetDrumPattern qui drope des Vec de la même façon.
            }

            // ── MIDI clips (piano roll) ───────────────────────────────────────
            AudioCommand::AddMidiClip { track_id, clip } => {
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    self.midi_clips[slot].retain(|c| c.id != clip.id);
                    self.midi_clips[slot].push(clip);
                }
            }
            AudioCommand::UpdateMidiClipNotes { track_id, clip_id, notes } => {
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    if let Some(c) = self.midi_clips[slot].iter_mut().find(|c| c.id == clip_id) {
                        c.notes = notes; // drops old Vec depuis le callback (acceptable)
                    }
                }
            }
            AudioCommand::DeleteMidiClip { track_id, clip_id } => {
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    self.midi_clips[slot].retain(|c| c.id != clip_id);
                }
            }
            AudioCommand::ClearMidiClips { track_id } => {
                if let Some(slot) = self.synth_track_ids.iter().position(|&id| id == track_id) {
                    self.midi_clips[slot].clear();
                }
            }

            // ── Mixer ─────────────────────────────────────────────────────────
            AudioCommand::SetTrackVolume { track_id, volume } => {
                self.track_volumes[(track_id % 64) as usize] = volume.clamp(0.0, 4.0);
            }
            AudioCommand::SetTrackPan { track_id, pan } => {
                self.track_pans[(track_id % 64) as usize] = pan.clamp(-1.0, 1.0);
            }
            AudioCommand::SetDrumRackTrackId { track_id } => {
                self.drum_rack_track_id = track_id;
            }

            // ── Effets ────────────────────────────────────────────────────────
            AudioCommand::AddEffect { track_id, effect_id, effect } => {
                let tidx = (track_id % 64) as usize;
                self.effect_chains[tidx].add_with_id(effect_id, effect.0);
            }
            AudioCommand::RemoveEffect { track_id, effect_id } => {
                let tidx = (track_id % 64) as usize;
                self.effect_chains[tidx].remove(effect_id);
            }
            AudioCommand::SetEffectParam { track_id, effect_id, param, value } => {
                let tidx = (track_id % 64) as usize;
                self.effect_chains[tidx].set_param(effect_id, &param, value);
                // La String param est droppée ici depuis le callback (acceptable, rare).
            }
            AudioCommand::SetEffectBypass { track_id, effect_id, bypass } => {
                let tidx = (track_id % 64) as usize;
                self.effect_chains[tidx].set_bypass(effect_id, bypass);
            }

            // ── Automation ────────────────────────────────────────────────────
            AudioCommand::SetAutomationPoints { track_id, param, points } => {
                let tidx = (track_id % 64) as usize;
                match param {
                    crate::audio::automation::AutomationParam::Volume => {
                        // Drop de l'ancienne Vec + remplacement (allocation côté thread principal).
                        self.automation_volume[tidx] = points;
                    }
                    crate::audio::automation::AutomationParam::Pan => {
                        self.automation_pan[tidx] = points;
                    }
                }
            }

            // ── Enregistrement synthé (capture lock-free) ─────────────────────
            AudioCommand::SetSynthRecordProducer { track_id, producer } => {
                self.synth_record_track_id = Some(track_id);
                self.synth_record_producer = Some(producer.0);
            }
            AudioCommand::ClearSynthRecord => {
                self.synth_record_track_id = None;
                // Drop du HeapProd → ferme le ring buffer côté producteur.
                self.synth_record_producer = None;
            }
        }
    }
}

// ─── Fonctions de panoramique (puissance constante) ──────────────────────────
#[inline]
fn pan_left(pan: f32) -> f32 {
    let angle = (pan.clamp(-1.0, 1.0) + 1.0) * std::f32::consts::FRAC_PI_4;
    angle.cos()
}

#[inline]
fn pan_right(pan: f32) -> f32 {
    let angle = (pan.clamp(-1.0, 1.0) + 1.0) * std::f32::consts::FRAC_PI_4;
    angle.sin()
}

// ─── Shadow state pour les effets (accès depuis le thread principal) ──────────
pub struct EffectShadowEntry {
    pub effect_type: String,
    pub params: std::collections::HashMap<String, f32>,
    pub bypass: bool,
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
    /// Step courant du séquenceur (partagé avec le callback audio).
    pub current_step: Arc<AtomicU8>,
    /// BPM courant comme bits f64 (lecture lock-free depuis le thread principal).
    pub bpm_bits: Arc<AtomicU64>,
    /// Rapport de VU-mètres — lu par le thread de métrologie (lib.rs) toutes les 33ms.
    pub meter_report: Arc<Mutex<MeterReport>>,
    /// Shadow state des effets — lecture depuis le thread principal sans passer par le callback.
    /// Key : (track_id, effect_id) → (type, params, bypass).
    pub effects_shadow: Mutex<std::collections::HashMap<(u32, u32), EffectShadowEntry>>,
    /// Compteur d'IDs d'effets (généré côté thread principal avant envoi).
    pub next_effect_id: AtomicU32,
    /// Réduction de gain par compresseur : (track_id, effect_id) → bits f32 atomiques.
    /// Mis à jour chaque frame par le thread audio ; lu par `get_compressor_gain_reduction`.
    pub gain_reductions: Mutex<std::collections::HashMap<(u32, u32), Arc<AtomicU32>>>,
    /// Shadow state de l'automation — géré depuis le thread principal (Tauri commands).
    /// Key : (track_id_numeric, parameter_str) → Vec<(point_id, time_beats, value)>
    pub automation_shadow: std::collections::HashMap<(u32, String), Vec<(u32, f64, f32)>>,
    /// Compteur d'IDs de points d'automation (thread principal uniquement).
    pub next_auto_point_id: AtomicU32,
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
                    current_step: Arc::new(AtomicU8::new(0)),
                    bpm_bits: Arc::new(AtomicU64::new(120.0f64.to_bits())),
                    meter_report: Arc::new(Mutex::new(MeterReport::default())),
                    effects_shadow: Mutex::new(std::collections::HashMap::new()),
                    next_effect_id: AtomicU32::new(1),
                    gain_reductions: Mutex::new(std::collections::HashMap::new()),
                    automation_shadow: std::collections::HashMap::new(),
                    next_auto_point_id: AtomicU32::new(1),
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
        let current_step_atomic = Arc::new(AtomicU8::new(0));
        let bpm_atomic = Arc::new(AtomicU64::new(120.0f64.to_bits()));
        let position_atomic_cb = Arc::clone(&position_atomic);
        let is_playing_atomic_cb = Arc::clone(&is_playing_atomic);
        let current_step_atomic_cb = Arc::clone(&current_step_atomic);
        let bpm_atomic_cb = Arc::clone(&bpm_atomic);

        let meter_report = Arc::new(Mutex::new(MeterReport::default()));
        let meter_report_cb = Arc::clone(&meter_report);

        // Pré-allouer l'état du callback (pas d'allocation dans le callback lui-même).
        let mut samples: Vec<Option<SampleData>> = Vec::with_capacity(256);
        samples.resize_with(256, || None);

        // Générer et injecter les sons synthétiques du métronome.
        let accent_frames = Metronome::generate_accent(sample_rate);
        let click_frames  = Metronome::generate_normal(sample_rate);
        samples[METRO_ACCENT_ID as usize] = Some(SampleData { frames: accent_frames, channels: 1, sample_rate });
        samples[METRO_CLICK_ID  as usize] = Some(SampleData { frames: click_frames,  channels: 1, sample_rate });

        // BPM par défaut : 120. samples_per_step = 48000 * 60 / (120 * 4) = 6000
        let default_bpm = 120.0f64;
        let default_sps = (sample_rate as f64 * 60.0) / (default_bpm * 4.0);

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
            // Drum sequencer
            bpm: default_bpm,
            samples_per_step: default_sps,
            sequencer_counter: 0.0,
            sequencer_step: 0,
            drum_pattern_steps: 16,
            drum_pad_steps: [[false; 32]; 8],
            drum_pad_velocities: [[1.0; 32]; 8],
            // Mapping par défaut : kick, snare, hihat, hihat_open, clap, tomH, tomB, snare2
            drum_pad_samples: [0, 2, 4, 5, 6, 7, 8, 3],
            drum_pad_volumes: [1.0f32; 8],
            drum_pad_pitches: [0.0f32; 8],
            drum_voices: Vec::with_capacity(64),
            metronome_enabled: false,
            metronome_volume: 0.6,
            metronome_voice: None,
            // Boucle
            loop_enabled: false,
            loop_start_frames: 0,
            loop_end_frames: 0,
            // Mute / Solo
            track_muted: [false; 64],
            track_solo: [false; 64],
            any_track_solo: false,
            // Volume / Pan
            track_volumes: [1.0f32; 64],
            track_pans: [0.0f32; 64],
            drum_rack_track_id: NO_TRACK,
            // Metering
            track_peak_l: [0.0f32; 64],
            track_peak_r: [0.0f32; 64],
            track_rms_sum_l: [0.0f64; 64],
            track_rms_sum_r: [0.0f64; 64],
            track_rms_count: [0u32; 64],
            track_known_ids: [NO_TRACK; 64],
            master_peak_l: 0.0,
            master_peak_r: 0.0,
            master_rms_sum_l: 0.0,
            master_rms_sum_r: 0.0,
            master_rms_count: 0,
            meter_frame_count: 0,
            meter_report: meter_report_cb,
            // Synthétiseur : pré-allouer MAX_SYNTH_TRACKS moteurs.
            synth_engines: (0..MAX_SYNTH_TRACKS).map(|_| SynthEngine::new(sample_rate)).collect(),
            synth_track_ids: vec![NO_TRACK; MAX_SYNTH_TRACKS],
            midi_clips: vec![Vec::new(); MAX_SYNTH_TRACKS],
            // Chaînes d'effets : 64 slots vides pré-alloués.
            effect_chains: (0..64).map(|_| EffectChain::new()).collect(),
            // Automation : 64 lanes vides pré-allouées.
            automation_volume: vec![Vec::new(); 64],
            automation_pan: vec![Vec::new(); 64],
            // Enregistrement synthé : inactif par défaut.
            synth_record_track_id: None,
            synth_record_producer: None,
            // Atomics
            position_atomic: position_atomic_cb,
            is_playing_atomic: is_playing_atomic_cb,
            current_step_atomic: current_step_atomic_cb,
            bpm_atomic: bpm_atomic_cb,
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
                                            Voice { sample_id: clip.sample_id, position: 0, velocity: 1.0 },
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
                    // Buffer par piste pour appliquer les effets après agrégation complète.
                    let mut track_bufs = [(0.0f32, 0.0f32); 64usize];

                    // Position en beats pour l'automation (samples_per_step * 4 = samples par beat).
                    let auto_pos_beats = if state.samples_per_step > 0.0 {
                        state.position_frames as f64 / (state.samples_per_step * 4.0)
                    } else {
                        0.0
                    };

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

                    // ── MIDI clips (piano roll) — déclenche les notes au bon frame ──
                    if state.is_playing {
                        // Approche deux phases pour satisfaire le borrow checker :
                        // Phase 1 : lecture immutable de midi_clips/synth_track_ids → tableau stack
                        // Phase 2 : mutation de synth_engines avec les événements collectés
                        let mut midi_events: [(u8, u8, u8, bool); 64] = [(0, 0, 0, false); 64];
                        let mut event_count = 0usize;
                        {
                            let spb = state.samples_per_step * 4.0; // samples par beat
                            let pos = state.position_frames;
                            let track_ids = &state.synth_track_ids;
                            for (slot, clips) in state.midi_clips.iter().enumerate() {
                                if track_ids[slot] == NO_TRACK { continue; }
                                for clip in clips {
                                    let clip_start = (clip.start_beats * spb) as u64;
                                    for note in &clip.notes {
                                        let ns = clip_start + (note.start_beats * spb) as u64;
                                        let ne = ns + ((note.duration_beats * spb) as u64).max(1);
                                        if pos == ns && event_count < 64 {
                                            midi_events[event_count] = (slot as u8, note.note, note.velocity, true);
                                            event_count += 1;
                                        }
                                        if pos == ne && event_count < 64 {
                                            midi_events[event_count] = (slot as u8, note.note, 0, false);
                                            event_count += 1;
                                        }
                                    }
                                }
                            }
                        } // fin de l'emprunt immutable
                        for i in 0..event_count {
                            let (slot, note, velocity, is_on) = midi_events[i];
                            if is_on {
                                state.synth_engines[slot as usize].note_on(note, velocity);
                            } else {
                                state.synth_engines[slot as usize].note_off(note);
                            }
                        }
                    }

                    // ── Synthétiseurs live (toujours actifs, même sans transport) ──
                    for i in 0..MAX_SYNTH_TRACKS {
                        let track_id = state.synth_track_ids[i];
                        if track_id == NO_TRACK { continue; }
                        let tidx = (track_id % 64) as usize;
                        if state.track_muted[tidx] { continue; }
                        if state.any_track_solo && !state.track_solo[tidx] { continue; }
                        let (sl, sr) = state.synth_engines[i].process_frame(state.sample_rate);
                        let vol = crate::audio::automation::get_auto_value(
                            &state.automation_volume[tidx], auto_pos_beats,
                        ).unwrap_or(state.track_volumes[tidx]);
                        let pan_norm = crate::audio::automation::get_auto_value(
                            &state.automation_pan[tidx], auto_pos_beats,
                        );
                        let pan = pan_norm.map(|v| v * 2.0 - 1.0).unwrap_or(state.track_pans[tidx]);
                        let out_l = sl * vol * pan_left(pan);
                        let out_r = sr * vol * pan_right(pan);
                        track_bufs[tidx].0 += out_l;
                        track_bufs[tidx].1 += out_r;
                        state.track_known_ids[tidx] = track_id;

                        // Capture pour l'enregistrement synthé (lock-free, try_push jamais bloquant).
                        if state.synth_record_track_id == Some(track_id) {
                            if let Some(ref mut prod) = state.synth_record_producer {
                                use ringbuf::traits::Producer;
                                let _ = prod.try_push(out_l);
                                let _ = prod.try_push(out_r);
                            }
                        }
                    }

                    // Voix de clips (timeline).
                    if state.is_playing {
                        for (cid, voice) in &mut state.clip_voices {
                            // Vérifier mute / solo avant de mixer.
                            let clip_info = state.clips.iter().find(|c| c.id == *cid)
                                .map(|c| (c.track_id, (c.track_id % 64) as usize));
                            let audible = if let Some((_, tidx)) = clip_info {
                                let muted = state.track_muted[tidx];
                                let solo_ok = !state.any_track_solo || state.track_solo[tidx];
                                !muted && solo_ok
                            } else {
                                false
                            };
                            if audible {
                                let (l, r) = voice.next_stereo(&state.samples);
                                if let Some((track_id, tidx)) = clip_info {
                                    let vol = crate::audio::automation::get_auto_value(
                                        &state.automation_volume[tidx], auto_pos_beats,
                                    ).unwrap_or(state.track_volumes[tidx]);
                                    let pan_norm = crate::audio::automation::get_auto_value(
                                        &state.automation_pan[tidx], auto_pos_beats,
                                    );
                                    let pan = pan_norm.map(|v| v * 2.0 - 1.0).unwrap_or(state.track_pans[tidx]);
                                    track_bufs[tidx].0 += l * vol * pan_left(pan);
                                    track_bufs[tidx].1 += r * vol * pan_right(pan);
                                    state.track_known_ids[tidx] = track_id;
                                } else {
                                    left += l;
                                    right += r;
                                }
                            } else {
                                // Avancer quand même pour conserver la sync.
                                voice.position += 1;
                            }
                        }
                        state.clip_voices.retain(|(cid, v)| {
                            if v.is_done(&state.samples) { return false; }
                            // Respecter la durée du clip.
                            if let Some(clip) = state.clips.iter().find(|c| c.id == *cid) {
                                (v.position as u64) < clip.duration_frames
                            } else {
                                false
                            }
                        });

                        // ── Drum Sequencer ─────────────────────────────────────
                        if state.samples_per_step > 0.0 {
                            state.sequencer_counter += 1.0;
                            if state.sequencer_counter >= state.samples_per_step {
                                state.sequencer_counter -= state.samples_per_step;
                                // Avancer au step suivant (boucle).
                                state.sequencer_step = (state.sequencer_step + 1) % state.drum_pattern_steps;
                                state.current_step_atomic.store(
                                    state.sequencer_step as u8,
                                    Ordering::Relaxed,
                                );

                                // Déclencher les pads actifs pour ce step.
                                for pad in 0..8usize {
                                    if state.drum_pad_steps[pad][state.sequencer_step] {
                                        if state.drum_voices.len() < 64 {
                                            let sid        = state.drum_pad_samples[pad];
                                            let pattern_vel = state.drum_pad_velocities[pad][state.sequencer_step];
                                            let pad_vol    = state.drum_pad_volumes[pad];
                                            let velocity   = (pattern_vel * pad_vol).clamp(0.0, 2.0);
                                            let pitch_ratio = 2.0f64.powf(state.drum_pad_pitches[pad] as f64 / 12.0);
                                            state.drum_voices.push(PitchedVoice { sample_id: sid, position: 0.0, velocity, pitch_ratio });
                                        }
                                    }
                                }

                                // ── Métronome (click tous les 4 steps = 1 temps) ──
                                if state.metronome_enabled && state.sequencer_step % 4 == 0 {
                                    // Accent sur le premier temps (step 0), click normal sinon.
                                    let metro_sid = if state.sequencer_step == 0 {
                                        METRO_ACCENT_ID
                                    } else {
                                        METRO_CLICK_ID
                                    };
                                    let vol = state.metronome_volume;
                                    state.metronome_voice = Some(Voice { sample_id: metro_sid, position: 0, velocity: vol });
                                }
                            }
                        }

                        // ── Voix de drum rack (avec pitch) ─────────────────────
                        let mut drum_l = 0.0f32;
                        let mut drum_r = 0.0f32;
                        for voice in &mut state.drum_voices {
                            let (l, r) = voice.next_stereo(&state.samples);
                            drum_l += l;
                            drum_r += r;
                        }
                        state.drum_voices.retain(|v| !v.is_done(&state.samples));
                        // Appliquer vol/pan de la piste drum rack → track_bufs.
                        if state.drum_rack_track_id != NO_TRACK {
                            let tidx = (state.drum_rack_track_id % 64) as usize;
                            let vol = crate::audio::automation::get_auto_value(
                                &state.automation_volume[tidx], auto_pos_beats,
                            ).unwrap_or(state.track_volumes[tidx]);
                            let pan_norm = crate::audio::automation::get_auto_value(
                                &state.automation_pan[tidx], auto_pos_beats,
                            );
                            let pan = pan_norm.map(|v| v * 2.0 - 1.0).unwrap_or(state.track_pans[tidx]);
                            track_bufs[tidx].0 += drum_l * vol * pan_left(pan);
                            track_bufs[tidx].1 += drum_r * vol * pan_right(pan);
                            state.track_known_ids[tidx] = state.drum_rack_track_id;
                        } else {
                            left += drum_l;
                            right += drum_r;
                        }

                        // ── Voix de métronome ──────────────────────────────────
                        if let Some(ref mut mv) = state.metronome_voice {
                            let (l, r) = mv.next_stereo(&state.samples);
                            left += l;
                            right += r;
                            if mv.is_done(&state.samples) {
                                state.metronome_voice = None;
                            }
                        }

                        state.position_frames += 1;

                        // ── Boucle ────────────────────────────────────────────
                        if state.loop_enabled
                            && state.loop_end_frames > 0
                            && state.position_frames >= state.loop_end_frames
                        {
                            state.position_frames = state.loop_start_frames;
                            // Supprimer les voix de clips qui dépasseraient la zone de boucle.
                            state.clip_voices.retain(|(cid, _)| {
                                state.clips.iter().any(|c| {
                                    c.id == *cid
                                        && c.position_frames >= state.loop_start_frames
                                        && c.position_frames < state.loop_end_frames
                                })
                            });
                        }

                        // Mise à jour atomique périodique (~chaque 512 frames).
                        if state.position_frames % 512 == 0 {
                            state.position_atomic.store(state.position_frames, Ordering::Relaxed);
                        }
                    }

                    // ── Effets par piste + metering centralisé ───────────────
                    for tidx in 0..64usize {
                        let (tl, tr) = track_bufs[tidx];
                        // Appliquer la chaîne d'effets (pass-through si vide).
                        let (el, er) = state.effect_chains[tidx].process(tl, tr);
                        // Metering après effets (uniquement pour les pistes connues).
                        if state.track_known_ids[tidx] != NO_TRACK {
                            let ea = el.abs();
                            let ea_r = er.abs();
                            if ea > state.track_peak_l[tidx] { state.track_peak_l[tidx] = ea; }
                            if ea_r > state.track_peak_r[tidx] { state.track_peak_r[tidx] = ea_r; }
                            state.track_rms_sum_l[tidx] += (el * el) as f64;
                            state.track_rms_sum_r[tidx] += (er * er) as f64;
                            state.track_rms_count[tidx] += 1;
                        }
                        left += el;
                        right += er;
                    }

                    // Clamp + volume master.
                    let pre_l = left * state.master_volume;
                    let pre_r = right * state.master_volume;

                    // Accumulate master meter (avant clamp).
                    let abs_l = pre_l.abs();
                    let abs_r = pre_r.abs();
                    if abs_l > state.master_peak_l { state.master_peak_l = abs_l; }
                    if abs_r > state.master_peak_r { state.master_peak_r = abs_r; }
                    state.master_rms_sum_l += (pre_l * pre_l) as f64;
                    state.master_rms_sum_r += (pre_r * pre_r) as f64;
                    state.master_rms_count += 1;

                    // Rapport VU-mètres toutes les METER_INTERVAL_FRAMES frames.
                    state.meter_frame_count += 1;
                    if state.meter_frame_count >= METER_INTERVAL_FRAMES {
                        state.meter_frame_count = 0;
                        if let Ok(mut report) = state.meter_report.try_lock() {
                            // Master
                            let mc = state.master_rms_count.max(1) as f64;
                            report.master.peak_l = state.master_peak_l;
                            report.master.peak_r = state.master_peak_r;
                            report.master.rms_l  = (state.master_rms_sum_l / mc).sqrt() as f32;
                            report.master.rms_r  = (state.master_rms_sum_r / mc).sqrt() as f32;
                            // Tracks
                            report.tracks.clear();
                            for i in 0..64usize {
                                if state.track_known_ids[i] == NO_TRACK { continue; }
                                let tc = state.track_rms_count[i].max(1) as f64;
                                report.tracks.push(TrackMeterData {
                                    track_id: state.track_known_ids[i],
                                    peak_l: state.track_peak_l[i],
                                    peak_r: state.track_peak_r[i],
                                    rms_l: (state.track_rms_sum_l[i] / tc).sqrt() as f32,
                                    rms_r: (state.track_rms_sum_r[i] / tc).sqrt() as f32,
                                });
                                // Reset accumulateurs de piste
                                state.track_peak_l[i] = 0.0;
                                state.track_peak_r[i] = 0.0;
                                state.track_rms_sum_l[i] = 0.0;
                                state.track_rms_sum_r[i] = 0.0;
                                state.track_rms_count[i] = 0;
                            }
                        }
                        // Reset accumulateurs master (même si try_lock a échoué)
                        state.master_peak_l = 0.0;
                        state.master_peak_r = 0.0;
                        state.master_rms_sum_l = 0.0;
                        state.master_rms_sum_r = 0.0;
                        state.master_rms_count = 0;
                    }

                    let out_l = pre_l.clamp(-1.0, 1.0);
                    let out_r = pre_r.clamp(-1.0, 1.0);

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
            current_step: current_step_atomic,
            bpm_bits: bpm_atomic,
            meter_report,
            effects_shadow: Mutex::new(std::collections::HashMap::new()),
            next_effect_id: AtomicU32::new(1),
            gain_reductions: Mutex::new(std::collections::HashMap::new()),
            automation_shadow: std::collections::HashMap::new(),
            next_auto_point_id: AtomicU32::new(1),
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

    /// Retourne un clone du canal de commandes audio (pour le MidiEngine).
    /// None si le moteur audio n'a pas pu être initialisé.
    pub fn get_command_sender(
        &self,
    ) -> Option<Arc<Mutex<ringbuf::HeapProd<AudioCommand>>>> {
        self.command_sender.clone()
    }

    /// Retourne la position courante en secondes.
    pub fn position_secs(&self) -> f64 {
        let frames = self.position_frames.load(Ordering::Relaxed);
        frames as f64 / self.config.sample_rate as f64
    }
}
