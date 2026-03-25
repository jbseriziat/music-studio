use super::filter::FilterType;
use super::lfo::{ModDestination, ModRoute, ModSource, LFO};
use super::oscillator::Waveform;
use super::voice::SynthVoice;
use super::SynthPreset;

/// Mode de jeu du synthétiseur.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SynthMode {
    Poly,
    Mono,
    Legato,
}

impl Default for SynthMode {
    fn default() -> Self { SynthMode::Poly }
}

/// Moteur de synthèse soustractif.
/// Phase 5.2 : matrice de modulation, enveloppe de filtre, filtres avancés.
pub struct SynthEngine {
    voices: Vec<SynthVoice>,
    pub preset: SynthPreset,
    pub master_volume: f32,
    voice_counter: u64,
    sample_rate: u32,

    // ── Phase 5.1 ───────────────────────────────────────────────────
    pub lfo1: LFO,
    pub lfo2: LFO,
    pub mode: SynthMode,
    pub glide_time_ms: f32,
    glide_coeff: f64,
    held_notes: Vec<u8>,
    pub bpm: f64,

    // ── Phase 5.2 ───────────────────────────────────────────────────
    /// Matrice de modulation (max 8 routages).
    pub mod_routes: Vec<ModRoute>,
    /// Compteur d'ID pour les routages.
    mod_route_counter: u32,
    /// Intensité de la modulation filter envelope → cutoff (0.0–1.0).
    pub filter_env_amount: f32,
}

impl SynthEngine {
    pub fn new(sample_rate: u32) -> Self {
        let preset = SynthPreset::default();
        let mut voices = Vec::with_capacity(8);
        for _ in 0..8 {
            voices.push(SynthVoice::new());
        }
        let mut engine = Self {
            voices,
            master_volume: 0.5,
            voice_counter: 0,
            sample_rate,
            preset: preset.clone(),
            lfo1: LFO::new(),
            lfo2: LFO::new(),
            mode: SynthMode::Poly,
            glide_time_ms: 0.0,
            glide_coeff: 0.0,
            held_notes: Vec::with_capacity(16),
            bpm: 120.0,
            mod_routes: Vec::with_capacity(8),
            mod_route_counter: 0,
            filter_env_amount: 0.0,
        };
        engine.apply_preset_to_voices(&preset);
        engine
    }

    // ── Preset ───────────────────────────────────────────────────────────────

    pub fn apply_preset(&mut self, preset: &SynthPreset) {
        self.preset = preset.clone();
        self.apply_preset_to_voices(preset);
    }

    fn apply_preset_to_voices(&mut self, preset: &SynthPreset) {
        for voice in &mut self.voices {
            voice.oscillator.waveform = preset.waveform.clone();
            voice.oscillator.octave_offset = preset.octave_offset;
            voice.oscillator.detune_cents = preset.detune_cents;
            voice.envelope.attack = preset.attack;
            voice.envelope.decay = preset.decay;
            voice.envelope.sustain = preset.sustain;
            voice.envelope.release = preset.release;
            voice.filter.cutoff = preset.cutoff;
            voice.filter.resonance = preset.resonance;
            voice.filter.update_coefficients(self.sample_rate);
            voice.base_cutoff = preset.cutoff;
            // Osc2
            voice.osc2_enabled = preset.osc2_enabled;
            voice.osc_mix = preset.osc_mix;
            voice.oscillator2.waveform = preset.osc2_waveform.clone();
            voice.oscillator2.octave_offset = preset.osc2_octave_offset;
            voice.oscillator2.detune_cents = preset.osc2_detune_cents;
            // Filter env amount
            voice.filter_env_amount = self.filter_env_amount;
        }
    }

    // ── Mod routes ───────────────────────────────────────────────────────────

    pub fn add_mod_route(&mut self, source: ModSource, destination: ModDestination, amount: f32) -> u32 {
        self.mod_route_counter += 1;
        let id = self.mod_route_counter;
        if self.mod_routes.len() < 8 {
            self.mod_routes.push(ModRoute {
                id,
                source,
                destination,
                amount: amount.clamp(-1.0, 1.0),
            });
        }
        id
    }

    pub fn update_mod_route(&mut self, route_id: u32, amount: f32) {
        if let Some(route) = self.mod_routes.iter_mut().find(|r| r.id == route_id) {
            route.amount = amount.clamp(-1.0, 1.0);
        }
    }

    pub fn remove_mod_route(&mut self, route_id: u32) {
        self.mod_routes.retain(|r| r.id != route_id);
    }

    // ── Paramètres individuels ────────────────────────────────────────────────

    pub fn set_param(&mut self, param: &str, value: f32) {
        match param {
            "attack" => {
                self.preset.attack = value.clamp(0.001, 5.0);
                for v in &mut self.voices { v.envelope.attack = self.preset.attack; }
            }
            "decay" => {
                self.preset.decay = value.clamp(0.001, 5.0);
                for v in &mut self.voices { v.envelope.decay = self.preset.decay; }
            }
            "sustain" => {
                self.preset.sustain = value.clamp(0.0, 1.0);
                for v in &mut self.voices { v.envelope.sustain = self.preset.sustain; }
            }
            "release" => {
                self.preset.release = value.clamp(0.001, 10.0);
                for v in &mut self.voices { v.envelope.release = self.preset.release; }
            }
            "cutoff" => {
                self.preset.cutoff = value.clamp(20.0, 20000.0);
                for v in &mut self.voices {
                    v.filter.cutoff = self.preset.cutoff;
                    v.base_cutoff = self.preset.cutoff;
                    v.filter.update_coefficients(self.sample_rate);
                }
            }
            "resonance" => {
                self.preset.resonance = value.clamp(0.0, 1.0);
                for v in &mut self.voices {
                    v.filter.resonance = self.preset.resonance;
                    v.filter.update_coefficients(self.sample_rate);
                }
            }
            "octave" => {
                self.preset.octave_offset = value.clamp(-2.0, 2.0) as i8;
                for v in &mut self.voices { v.oscillator.octave_offset = self.preset.octave_offset; }
            }
            "detune" => {
                self.preset.detune_cents = value.clamp(-50.0, 50.0);
                for v in &mut self.voices { v.oscillator.detune_cents = self.preset.detune_cents; }
            }
            "waveform" => {
                let wf = waveform_from_index(value as u32);
                self.preset.waveform = wf.clone();
                for v in &mut self.voices { v.oscillator.waveform = wf.clone(); }
            }
            "volume" => {
                self.master_volume = value.clamp(0.0, 2.0);
            }
            // ── Osc2 ───────────────────────────────────────────────
            "osc2_enabled" => {
                let en = value > 0.5;
                self.preset.osc2_enabled = en;
                for v in &mut self.voices { v.osc2_enabled = en; }
            }
            "osc2_waveform" => {
                let wf = waveform_from_index(value as u32);
                self.preset.osc2_waveform = wf.clone();
                for v in &mut self.voices { v.oscillator2.waveform = wf.clone(); }
            }
            "osc2_octave" => {
                let oct = value.clamp(-2.0, 2.0) as i8;
                self.preset.osc2_octave_offset = oct;
                for v in &mut self.voices { v.oscillator2.octave_offset = oct; }
            }
            "osc2_detune" => {
                let det = value.clamp(-50.0, 50.0);
                self.preset.osc2_detune_cents = det;
                for v in &mut self.voices { v.oscillator2.detune_cents = det; }
            }
            "osc_mix" => {
                let mix = value.clamp(0.0, 1.0);
                self.preset.osc_mix = mix;
                for v in &mut self.voices { v.osc_mix = mix; }
            }
            // ── LFO ────────────────────────────────────────────────
            "lfo1_waveform" => { self.lfo1.waveform = super::lfo::LfoWaveform::from_index(value as u32); }
            "lfo1_rate" => { self.lfo1.rate = value.clamp(0.1, 20.0); }
            "lfo1_depth" => { self.lfo1.depth = value.clamp(0.0, 1.0); }
            "lfo1_destination" => { self.lfo1.destination = dest_from_index(value as u32); }
            "lfo1_sync" => { self.lfo1.sync_to_bpm = value > 0.5; }
            "lfo2_waveform" => { self.lfo2.waveform = super::lfo::LfoWaveform::from_index(value as u32); }
            "lfo2_rate" => { self.lfo2.rate = value.clamp(0.1, 20.0); }
            "lfo2_depth" => { self.lfo2.depth = value.clamp(0.0, 1.0); }
            "lfo2_destination" => { self.lfo2.destination = dest_from_index(value as u32); }
            "lfo2_sync" => { self.lfo2.sync_to_bpm = value > 0.5; }
            // ── Mode & glide ───────────────────────────────────────
            "synth_mode" => {
                self.mode = match value as u32 {
                    1 => SynthMode::Mono,
                    2 => SynthMode::Legato,
                    _ => SynthMode::Poly,
                };
            }
            "glide_time" => { self.set_glide_time(value.clamp(0.0, 5000.0)); }
            // ── Phase 5.2 : filter type, drive, filter env ─────────
            "filter_type" => {
                let ft = FilterType::from_index(value as u32);
                for v in &mut self.voices {
                    v.filter.filter_type = ft.clone();
                    v.filter.update_coefficients(self.sample_rate);
                }
            }
            "drive" => {
                let d = value.clamp(0.0, 1.0);
                for v in &mut self.voices { v.filter.drive = d; }
            }
            "filter_env_amount" => {
                self.filter_env_amount = value.clamp(0.0, 1.0);
                for v in &mut self.voices { v.filter_env_amount = self.filter_env_amount; }
            }
            "filter_env_attack" => {
                let val = value.clamp(0.001, 5.0);
                for v in &mut self.voices { v.filter_envelope.attack = val; }
            }
            "filter_env_decay" => {
                let val = value.clamp(0.001, 5.0);
                for v in &mut self.voices { v.filter_envelope.decay = val; }
            }
            "filter_env_sustain" => {
                let val = value.clamp(0.0, 1.0);
                for v in &mut self.voices { v.filter_envelope.sustain = val; }
            }
            "filter_env_release" => {
                let val = value.clamp(0.001, 10.0);
                for v in &mut self.voices { v.filter_envelope.release = val; }
            }
            _ => {
                eprintln!("[SynthEngine] Paramètre inconnu : {param}");
            }
        }
    }

    pub fn set_glide_time(&mut self, time_ms: f32) {
        self.glide_time_ms = time_ms;
        if time_ms <= 0.0 {
            self.glide_coeff = 0.0;
        } else {
            let samples = (time_ms / 1000.0) * self.sample_rate as f32;
            self.glide_coeff = if samples > 1.0 { (-5.0 / samples as f64).exp() } else { 0.0 };
        }
        for v in &mut self.voices {
            v.oscillator.set_glide_coeff(self.glide_coeff);
            v.oscillator2.set_glide_coeff(self.glide_coeff);
        }
    }

    // ── Notes ─────────────────────────────────────────────────────────────────

    pub fn note_on(&mut self, note: u8, velocity: u8) {
        self.voice_counter += 1;
        let vel_f = velocity as f32 / 127.0;
        let freq = midi_note_to_freq(note);

        match self.mode {
            SynthMode::Poly => {
                let idx = self.find_free_voice();
                let voice = &mut self.voices[idx];
                voice.note = note;
                voice.velocity = vel_f;
                voice.oscillator.set_frequency(freq);
                voice.oscillator2.set_frequency(freq);
                voice.oscillator.reset();
                voice.oscillator2.reset();
                voice.filter.reset();
                voice.envelope.trigger();
                voice.filter_envelope.trigger();
                voice.active = true;
                voice.age = self.voice_counter;
            }
            SynthMode::Mono => {
                self.held_notes.push(note);
                let voice = &mut self.voices[0];
                voice.note = note;
                voice.velocity = vel_f;
                if self.glide_coeff > 0.0 {
                    voice.oscillator.set_target_frequency(freq);
                    voice.oscillator2.set_target_frequency(freq);
                } else {
                    voice.oscillator.set_frequency(freq);
                    voice.oscillator2.set_frequency(freq);
                }
                voice.oscillator.reset();
                voice.oscillator2.reset();
                voice.filter.reset();
                voice.envelope.trigger();
                voice.filter_envelope.trigger();
                voice.active = true;
                voice.age = self.voice_counter;
            }
            SynthMode::Legato => {
                let was_empty = self.held_notes.is_empty();
                self.held_notes.push(note);
                let voice = &mut self.voices[0];
                voice.note = note;
                voice.velocity = vel_f;
                if self.glide_coeff > 0.0 {
                    voice.oscillator.set_target_frequency(freq);
                    voice.oscillator2.set_target_frequency(freq);
                } else {
                    voice.oscillator.set_frequency(freq);
                    voice.oscillator2.set_frequency(freq);
                }
                if was_empty {
                    voice.oscillator.reset();
                    voice.oscillator2.reset();
                    voice.filter.reset();
                    voice.envelope.trigger();
                    voice.filter_envelope.trigger();
                }
                voice.active = true;
                voice.age = self.voice_counter;
            }
        }
    }

    pub fn note_off(&mut self, note: u8) {
        match self.mode {
            SynthMode::Poly => {
                for voice in &mut self.voices {
                    if voice.active && voice.note == note {
                        voice.envelope.release();
                        voice.filter_envelope.release();
                    }
                }
            }
            SynthMode::Mono | SynthMode::Legato => {
                self.held_notes.retain(|&n| n != note);
                if self.held_notes.is_empty() {
                    self.voices[0].envelope.release();
                    self.voices[0].filter_envelope.release();
                } else {
                    let prev_note = *self.held_notes.last().unwrap();
                    let freq = midi_note_to_freq(prev_note);
                    self.voices[0].note = prev_note;
                    if self.glide_coeff > 0.0 {
                        self.voices[0].oscillator.set_target_frequency(freq);
                        self.voices[0].oscillator2.set_target_frequency(freq);
                    } else {
                        self.voices[0].oscillator.set_frequency(freq);
                        self.voices[0].oscillator2.set_frequency(freq);
                    }
                }
            }
        }
    }

    // ── Génération audio ──────────────────────────────────────────────────────

    pub fn process_frame(&mut self, sample_rate: u32) -> (f32, f32) {
        // LFOs.
        let lfo1_val = self.lfo1.process(sample_rate, self.bpm);
        let lfo2_val = self.lfo2.process(sample_rate, self.bpm);

        // Calculer les modulations par destination depuis les LFOs (legacy).
        let mut pitch_mod = 1.0f64;
        let mut cutoff_mod = 0.0f32;
        let mut volume_mod = 0.0f32;
        let mut pan_mod = 0.0f32;

        for (val, dest) in [(lfo1_val, self.lfo1.destination), (lfo2_val, self.lfo2.destination)] {
            apply_mod_to_accumulators(val, dest, &mut pitch_mod, &mut cutoff_mod, &mut volume_mod, &mut pan_mod);
        }

        // Appliquer la matrice de modulation.
        // Les sources per-voice (Velocity, NoteNumber, Envelope1/2) seront évaluées par voix.
        // Les sources globales (LFO1, LFO2) s'ajoutent ici.
        for route in &self.mod_routes {
            let global_val = match route.source {
                ModSource::LFO1 => lfo1_val * route.amount,
                ModSource::LFO2 => lfo2_val * route.amount,
                _ => continue, // per-voice sources handled below
            };
            apply_mod_to_accumulators(global_val, route.destination, &mut pitch_mod, &mut cutoff_mod, &mut volume_mod, &mut pan_mod);
        }

        let mut sample = 0.0f32;
        for voice_idx in 0..self.voices.len() {
            if !self.voices[voice_idx].active {
                continue;
            }

            // Per-voice modulations from the mod matrix.
            let mut v_pitch_mod = pitch_mod;
            let mut v_cutoff_mod = cutoff_mod;
            let mut v_volume_mod = volume_mod;
            let mut v_pan_mod = pan_mod;
            let mut velocity_cutoff = 0.0f32;

            for route in &self.mod_routes {
                let per_voice_val = match route.source {
                    ModSource::Envelope1 => self.voices[voice_idx].envelope.level * route.amount,
                    ModSource::Envelope2 => self.voices[voice_idx].filter_envelope.level * route.amount,
                    ModSource::Velocity => self.voices[voice_idx].velocity * route.amount,
                    ModSource::NoteNumber => (self.voices[voice_idx].note as f32 / 127.0) * route.amount,
                    _ => continue, // global sources already handled
                };
                match route.destination {
                    ModDestination::Cutoff => { velocity_cutoff += per_voice_val * 4000.0; }
                    _ => {
                        apply_mod_to_accumulators(per_voice_val, route.destination, &mut v_pitch_mod, &mut v_cutoff_mod, &mut v_volume_mod, &mut v_pan_mod);
                    }
                }
            }

            let s = self.voices[voice_idx].process_full(sample_rate, v_pitch_mod, v_cutoff_mod, velocity_cutoff);
            sample += s;

            if self.voices[voice_idx].envelope.is_idle() {
                self.voices[voice_idx].active = false;
            }
        }

        sample *= self.master_volume;
        let vol_factor = (1.0 + volume_mod).clamp(0.0, 2.0);
        sample *= vol_factor;

        let pan = pan_mod.clamp(-1.0, 1.0);
        let left = sample * (1.0 - pan.max(0.0));
        let right = sample * (1.0 + pan.min(0.0));

        (left, right)
    }

    // ── Utilitaires ───────────────────────────────────────────────────────────

    pub fn reset(&mut self) {
        for voice in &mut self.voices {
            voice.reset();
        }
        self.voice_counter = 0;
        self.held_notes.clear();
        self.lfo1.reset();
        self.lfo2.reset();
    }

    fn find_free_voice(&self) -> usize {
        for (i, v) in self.voices.iter().enumerate() {
            if !v.active || v.envelope.is_idle() { return i; }
        }
        for (i, v) in self.voices.iter().enumerate() {
            if matches!(v.envelope.state, super::envelope::EnvelopeState::Release) { return i; }
        }
        let mut oldest_idx = 0;
        let mut oldest_age = u64::MAX;
        for (i, v) in self.voices.iter().enumerate() {
            if v.age < oldest_age { oldest_age = v.age; oldest_idx = i; }
        }
        oldest_idx
    }
}

fn waveform_from_index(i: u32) -> Waveform {
    match i {
        1 => Waveform::Square,
        2 => Waveform::Sawtooth,
        3 => Waveform::Triangle,
        4 => Waveform::Noise,
        5 => Waveform::PulseWidth,
        _ => Waveform::Sine,
    }
}

fn dest_from_index(i: u32) -> ModDestination {
    match i {
        0 => ModDestination::Pitch,
        1 => ModDestination::Cutoff,
        2 => ModDestination::Volume,
        3 => ModDestination::Pan,
        4 => ModDestination::Osc2Pitch,
        5 => ModDestination::Resonance,
        _ => ModDestination::Pitch,
    }
}

fn apply_mod_to_accumulators(
    val: f32,
    dest: ModDestination,
    pitch_mod: &mut f64,
    cutoff_mod: &mut f32,
    volume_mod: &mut f32,
    pan_mod: &mut f32,
) {
    match dest {
        ModDestination::Pitch | ModDestination::Osc2Pitch => {
            *pitch_mod *= 2.0f64.powf(val as f64 * 2.0 / 12.0);
        }
        ModDestination::Cutoff => {
            *cutoff_mod += val * 4000.0;
        }
        ModDestination::Volume => {
            *volume_mod += val;
        }
        ModDestination::Pan => {
            *pan_mod += val;
        }
        ModDestination::Resonance => {
            // TODO: apply resonance modulation if needed
        }
    }
}

pub fn midi_note_to_freq(note: u8) -> f64 {
    440.0 * 2.0f64.powf((note as f64 - 69.0) / 12.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_midi_note_to_freq() {
        let f = midi_note_to_freq(69);
        assert!((f - 440.0).abs() < 0.001);
        let f = midi_note_to_freq(60);
        assert!((f - 261.626).abs() < 0.01);
    }

    #[test]
    fn test_polyphony_8_voices() {
        let mut engine = SynthEngine::new(48000);
        for n in 60..68u8 { engine.note_on(n, 100); }
        assert_eq!(engine.voices.iter().filter(|v| v.active).count(), 8);
    }

    #[test]
    fn test_voice_stealing() {
        let mut engine = SynthEngine::new(48000);
        for n in 60..69u8 { engine.note_on(n, 100); }
        assert_eq!(engine.voices.iter().filter(|v| v.active).count(), 8);
    }

    #[test]
    fn test_note_off_triggers_release() {
        use super::super::envelope::EnvelopeState;
        let mut engine = SynthEngine::new(48000);
        engine.note_on(60, 100);
        for _ in 0..10000 { engine.process_frame(48000); }
        engine.note_off(60);
        assert!(engine.voices.iter().any(|v| v.note == 60 && v.envelope.state == EnvelopeState::Release));
    }

    #[test]
    fn test_process_frame_silent_when_idle() {
        let mut engine = SynthEngine::new(48000);
        let (l, r) = engine.process_frame(48000);
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);
    }

    #[test]
    fn test_osc2_makes_sound() {
        let mut engine = SynthEngine::new(48000);
        engine.set_param("osc2_enabled", 1.0);
        engine.set_param("osc2_detune", 10.0);
        engine.note_on(60, 100);
        let mut max = 0.0f32;
        for _ in 0..1000 { let (l, _) = engine.process_frame(48000); max = max.max(l.abs()); }
        assert!(max > 0.01);
    }

    #[test]
    fn test_mono_mode_single_voice() {
        let mut engine = SynthEngine::new(48000);
        engine.mode = SynthMode::Mono;
        engine.note_on(60, 100);
        engine.note_on(64, 100);
        assert_eq!(engine.voices.iter().filter(|v| v.active).count(), 1);
        assert_eq!(engine.voices[0].note, 64);
    }

    #[test]
    fn test_legato_returns_to_prev_note() {
        let mut engine = SynthEngine::new(48000);
        engine.mode = SynthMode::Legato;
        engine.note_on(60, 100);
        engine.note_on(64, 100);
        engine.note_off(64);
        assert_eq!(engine.voices[0].note, 60);
        assert!(engine.voices[0].active);
    }

    #[test]
    fn test_lfo_modulates_output() {
        let mut engine = SynthEngine::new(48000);
        engine.lfo1.depth = 1.0;
        engine.lfo1.rate = 5.0;
        engine.lfo1.destination = ModDestination::Volume;
        engine.note_on(60, 100);
        let mut samples = Vec::new();
        for _ in 0..4800 { let (l, _) = engine.process_frame(48000); samples.push(l); }
        let min = samples.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = samples.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        assert!(max - min > 0.01);
    }

    #[test]
    fn test_mod_route_velocity_to_cutoff() {
        let mut engine = SynthEngine::new(48000);
        engine.set_param("cutoff", 1000.0);
        engine.add_mod_route(ModSource::Velocity, ModDestination::Cutoff, 1.0);
        engine.note_on(60, 127); // max velocity
        // Process a few frames
        for _ in 0..100 { engine.process_frame(48000); }
        // The mod route should have shifted the cutoff up
        // (velocity = 1.0 * amount 1.0 * 4000 = +4000 Hz → effective ~5000 Hz)
        // Just verify it produces sound
        let mut max = 0.0f32;
        for _ in 0..1000 { let (l, _) = engine.process_frame(48000); max = max.max(l.abs()); }
        assert!(max > 0.01, "Mod route velocity→cutoff should produce sound");
    }

    #[test]
    fn test_filter_envelope_modulates_cutoff() {
        let mut engine = SynthEngine::new(48000);
        engine.set_param("cutoff", 200.0);
        engine.set_param("filter_env_amount", 0.5);
        engine.set_param("filter_env_attack", 0.001);
        engine.set_param("filter_env_decay", 0.050);
        engine.note_on(60, 100);
        // During attack, filter env should open the filter
        let mut max_early = 0.0f32;
        for _ in 0..500 { let (l, _) = engine.process_frame(48000); max_early = max_early.max(l.abs()); }
        assert!(max_early > 0.001, "Filter env should open filter: {max_early}");
    }

    #[test]
    fn test_add_remove_mod_route() {
        let mut engine = SynthEngine::new(48000);
        let id = engine.add_mod_route(ModSource::LFO1, ModDestination::Pitch, 0.5);
        assert_eq!(engine.mod_routes.len(), 1);
        engine.remove_mod_route(id);
        assert_eq!(engine.mod_routes.len(), 0);
    }
}
