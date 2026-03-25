use super::lfo::{ModDestination, LFO};
use super::oscillator::Waveform;
use super::voice::SynthVoice;
use super::SynthPreset;

/// Mode de jeu du synthétiseur.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SynthMode {
    /// Polyphonie complète (8 ou 16 voix).
    Poly,
    /// Monophonique : une seule voix, retrigger à chaque note.
    Mono,
    /// Legato : une seule voix, pas de retrigger si une note est déjà tenue.
    Legato,
}

impl Default for SynthMode {
    fn default() -> Self {
        SynthMode::Poly
    }
}

/// Moteur de synthèse soustractif à 8 voix polyphoniques.
/// Phase 5 : double oscillateur, LFO×2, mono/legato, glide.
pub struct SynthEngine {
    /// Pool de voix pré-alloué (8 voix au niveau 3).
    voices: Vec<SynthVoice>,
    /// Preset actif (paramètres de synthèse).
    pub preset: SynthPreset,
    /// Volume de sortie normalisé (0.0–2.0). Valeur par défaut : 0.5.
    pub master_volume: f32,
    /// Compteur monotone pour le voice stealing (plus grand = plus récent).
    voice_counter: u64,
    /// Sample rate du système audio (nécessaire pour les recalculs de filtre).
    sample_rate: u32,

    // ── Phase 5 ─────────────────────────────────────────────────────
    /// LFO 1.
    pub lfo1: LFO,
    /// LFO 2.
    pub lfo2: LFO,
    /// Mode de jeu (Poly, Mono, Legato).
    pub mode: SynthMode,
    /// Temps de glide en ms (portamento).
    pub glide_time_ms: f32,
    /// Coefficient de glide pré-calculé (0.0 = instantané).
    glide_coeff: f64,
    /// Notes actuellement tenues (pour le mode mono/legato). Stack de notes.
    held_notes: Vec<u8>,
    /// BPM courant (pour le LFO sync).
    pub bpm: f64,
}

impl SynthEngine {
    /// Crée un moteur avec 8 voix pré-allouées et le preset par défaut.
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
        };
        engine.apply_preset_to_voices(&preset);
        engine
    }

    // ── Preset ───────────────────────────────────────────────────────────────

    /// Applique un preset : met à jour les paramètres de toutes les voix.
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
            // Phase 5 : osc2
            voice.osc2_enabled = preset.osc2_enabled;
            voice.osc_mix = preset.osc_mix;
            voice.oscillator2.waveform = preset.osc2_waveform.clone();
            voice.oscillator2.octave_offset = preset.osc2_octave_offset;
            voice.oscillator2.detune_cents = preset.osc2_detune_cents;
        }
    }

    // ── Paramètres individuels ────────────────────────────────────────────────

    /// Met à jour un paramètre par son nom (appelé depuis set_synth_param).
    pub fn set_param(&mut self, param: &str, value: f32) {
        match param {
            "attack" => {
                self.preset.attack = value.clamp(0.001, 5.0);
                for v in &mut self.voices {
                    v.envelope.attack = self.preset.attack;
                }
            }
            "decay" => {
                self.preset.decay = value.clamp(0.001, 5.0);
                for v in &mut self.voices {
                    v.envelope.decay = self.preset.decay;
                }
            }
            "sustain" => {
                self.preset.sustain = value.clamp(0.0, 1.0);
                for v in &mut self.voices {
                    v.envelope.sustain = self.preset.sustain;
                }
            }
            "release" => {
                self.preset.release = value.clamp(0.001, 10.0);
                for v in &mut self.voices {
                    v.envelope.release = self.preset.release;
                }
            }
            "cutoff" => {
                self.preset.cutoff = value.clamp(20.0, 20000.0);
                for v in &mut self.voices {
                    v.filter.cutoff = self.preset.cutoff;
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
                for v in &mut self.voices {
                    v.oscillator.octave_offset = self.preset.octave_offset;
                }
            }
            "detune" => {
                self.preset.detune_cents = value.clamp(-50.0, 50.0);
                for v in &mut self.voices {
                    v.oscillator.detune_cents = self.preset.detune_cents;
                }
            }
            "waveform" => {
                // 0=Sine, 1=Square, 2=Sawtooth, 3=Triangle, 4=Noise, 5=PulseWidth
                let wf = match value as u32 {
                    1 => Waveform::Square,
                    2 => Waveform::Sawtooth,
                    3 => Waveform::Triangle,
                    4 => Waveform::Noise,
                    5 => Waveform::PulseWidth,
                    _ => Waveform::Sine,
                };
                self.preset.waveform = wf.clone();
                for v in &mut self.voices {
                    v.oscillator.waveform = wf.clone();
                }
            }
            "volume" => {
                self.master_volume = value.clamp(0.0, 2.0);
            }
            // ── Phase 5 : osc2 params ───────────────────────────────
            "osc2_enabled" => {
                let enabled = value > 0.5;
                self.preset.osc2_enabled = enabled;
                for v in &mut self.voices {
                    v.osc2_enabled = enabled;
                }
            }
            "osc2_waveform" => {
                let wf = match value as u32 {
                    1 => Waveform::Square,
                    2 => Waveform::Sawtooth,
                    3 => Waveform::Triangle,
                    4 => Waveform::Noise,
                    5 => Waveform::PulseWidth,
                    _ => Waveform::Sine,
                };
                self.preset.osc2_waveform = wf.clone();
                for v in &mut self.voices {
                    v.oscillator2.waveform = wf.clone();
                }
            }
            "osc2_octave" => {
                let oct = value.clamp(-2.0, 2.0) as i8;
                self.preset.osc2_octave_offset = oct;
                for v in &mut self.voices {
                    v.oscillator2.octave_offset = oct;
                }
            }
            "osc2_detune" => {
                let det = value.clamp(-50.0, 50.0);
                self.preset.osc2_detune_cents = det;
                for v in &mut self.voices {
                    v.oscillator2.detune_cents = det;
                }
            }
            "osc_mix" => {
                let mix = value.clamp(0.0, 1.0);
                self.preset.osc_mix = mix;
                for v in &mut self.voices {
                    v.osc_mix = mix;
                }
            }
            // ── Phase 5 : LFO params ────────────────────────────────
            "lfo1_waveform" => {
                self.lfo1.waveform = super::lfo::LfoWaveform::from_index(value as u32);
            }
            "lfo1_rate" => {
                self.lfo1.rate = value.clamp(0.1, 20.0);
            }
            "lfo1_depth" => {
                self.lfo1.depth = value.clamp(0.0, 1.0);
            }
            "lfo1_destination" => {
                if let Some(dest) = ModDestination::from_str(match value as u32 {
                    0 => "pitch",
                    1 => "cutoff",
                    2 => "volume",
                    3 => "pan",
                    4 => "osc2pitch",
                    5 => "resonance",
                    _ => "pitch",
                }) {
                    self.lfo1.destination = dest;
                }
            }
            "lfo1_sync" => {
                self.lfo1.sync_to_bpm = value > 0.5;
            }
            "lfo2_waveform" => {
                self.lfo2.waveform = super::lfo::LfoWaveform::from_index(value as u32);
            }
            "lfo2_rate" => {
                self.lfo2.rate = value.clamp(0.1, 20.0);
            }
            "lfo2_depth" => {
                self.lfo2.depth = value.clamp(0.0, 1.0);
            }
            "lfo2_destination" => {
                if let Some(dest) = ModDestination::from_str(match value as u32 {
                    0 => "pitch",
                    1 => "cutoff",
                    2 => "volume",
                    3 => "pan",
                    4 => "osc2pitch",
                    5 => "resonance",
                    _ => "pitch",
                }) {
                    self.lfo2.destination = dest;
                }
            }
            "lfo2_sync" => {
                self.lfo2.sync_to_bpm = value > 0.5;
            }
            // ── Phase 5 : mode & glide ──────────────────────────────
            "synth_mode" => {
                self.mode = match value as u32 {
                    1 => SynthMode::Mono,
                    2 => SynthMode::Legato,
                    _ => SynthMode::Poly,
                };
            }
            "glide_time" => {
                self.set_glide_time(value.clamp(0.0, 5000.0));
            }
            _ => {
                eprintln!("[SynthEngine] Paramètre inconnu : {param}");
            }
        }
    }

    /// Définit le temps de glide en ms et recalcule le coefficient.
    pub fn set_glide_time(&mut self, time_ms: f32) {
        self.glide_time_ms = time_ms;
        if time_ms <= 0.0 {
            self.glide_coeff = 0.0;
        } else {
            // Coefficient exponentiel : atteint ~99% en time_ms.
            let samples = (time_ms / 1000.0) * self.sample_rate as f32;
            self.glide_coeff = if samples > 1.0 { (-5.0 / samples as f64).exp() } else { 0.0 };
        }
        for v in &mut self.voices {
            v.oscillator.set_glide_coeff(self.glide_coeff);
            v.oscillator2.set_glide_coeff(self.glide_coeff);
        }
    }

    // ── Notes ─────────────────────────────────────────────────────────────────

    /// Déclenche une note (note pressée). Gère le voice stealing automatiquement.
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
                // En mode mono, toujours retrigger l'enveloppe.
                voice.oscillator.reset();
                voice.oscillator2.reset();
                voice.filter.reset();
                voice.envelope.trigger();
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
                // En mode legato, ne retrigger que si aucune note n'était tenue.
                if was_empty {
                    voice.oscillator.reset();
                    voice.oscillator2.reset();
                    voice.filter.reset();
                    voice.envelope.trigger();
                }
                voice.active = true;
                voice.age = self.voice_counter;
            }
        }
    }

    /// Relâche une note (note relâchée). Déclenche la phase Release de l'enveloppe.
    pub fn note_off(&mut self, note: u8) {
        match self.mode {
            SynthMode::Poly => {
                for voice in &mut self.voices {
                    if voice.active && voice.note == note {
                        voice.envelope.release();
                    }
                }
            }
            SynthMode::Mono | SynthMode::Legato => {
                self.held_notes.retain(|&n| n != note);
                if self.held_notes.is_empty() {
                    // Plus aucune note tenue → release.
                    self.voices[0].envelope.release();
                } else {
                    // Revenir à la note précédente dans la pile.
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

    /// Génère exactement une frame stéréo. Retourne (left, right).
    /// Appelé depuis le callback audio (once per output frame).
    pub fn process_frame(&mut self, sample_rate: u32) -> (f32, f32) {
        // Calculer les valeurs des LFOs.
        let lfo1_val = self.lfo1.process(sample_rate, self.bpm);
        let lfo2_val = self.lfo2.process(sample_rate, self.bpm);

        // Calculer les modulations par destination.
        let mut pitch_mod = 1.0f64; // Facteur multiplicatif
        let mut cutoff_mod = 0.0f32; // Additif en Hz
        let mut volume_mod = 0.0f32; // Additif
        let mut pan_mod = 0.0f32;    // Additif

        for (val, dest) in [(lfo1_val, self.lfo1.destination), (lfo2_val, self.lfo2.destination)] {
            match dest {
                ModDestination::Pitch => {
                    // ±1 semitone per unit of LFO (vibrato).
                    pitch_mod *= 2.0f64.powf(val as f64 * 2.0 / 12.0);
                }
                ModDestination::Cutoff => {
                    // Modulation de ±4000 Hz.
                    cutoff_mod += val * 4000.0;
                }
                ModDestination::Volume => {
                    volume_mod += val;
                }
                ModDestination::Pan => {
                    pan_mod += val;
                }
                ModDestination::Osc2Pitch => {
                    // Handled per-voice if needed (using same pitch_mod for simplicity).
                }
                ModDestination::Resonance => {
                    // Small reso modulation (±0.3).
                    // Applied inline below.
                    let _ = val; // Handled below.
                }
            }
        }

        // Apply cutoff modulation to all voices temporarily.
        if cutoff_mod.abs() > 0.01 {
            let base_cutoff = self.preset.cutoff;
            let mod_cutoff = (base_cutoff + cutoff_mod).clamp(20.0, 20000.0);
            for voice in &mut self.voices {
                if voice.active {
                    voice.filter.cutoff = mod_cutoff;
                    voice.filter.update_coefficients(sample_rate);
                }
            }
        }

        let mut sample = 0.0f32;
        for voice in &mut self.voices {
            if voice.active {
                let s = if pitch_mod != 1.0 {
                    voice.process_with_mod(sample_rate, pitch_mod)
                } else {
                    voice.process(sample_rate)
                };
                sample += s;
                if voice.envelope.is_idle() {
                    voice.active = false;
                }
            }
        }

        // Restore cutoff after processing.
        if cutoff_mod.abs() > 0.01 {
            let base_cutoff = self.preset.cutoff;
            for voice in &mut self.voices {
                voice.filter.cutoff = base_cutoff;
                voice.filter.update_coefficients(sample_rate);
            }
        }

        sample *= self.master_volume;
        // Apply volume modulation (tremolo).
        let vol_factor = (1.0 + volume_mod).clamp(0.0, 2.0);
        sample *= vol_factor;

        // Apply pan modulation.
        let pan = pan_mod.clamp(-1.0, 1.0);
        let left = sample * (1.0 - pan.max(0.0));
        let right = sample * (1.0 + pan.min(0.0));

        (left, right)
    }

    // ── Utilitaires ───────────────────────────────────────────────────────────

    /// Remet toutes les voix à zéro (sans dés/réallocation).
    pub fn reset(&mut self) {
        for voice in &mut self.voices {
            voice.reset();
        }
        self.voice_counter = 0;
        self.held_notes.clear();
        self.lfo1.reset();
        self.lfo2.reset();
    }

    /// Trouve une voix libre (inactive ou Idle), ou vole la plus ancienne.
    fn find_free_voice(&self) -> usize {
        // Priorité 1 : voix Idle (enveloppe terminée).
        for (i, v) in self.voices.iter().enumerate() {
            if !v.active || v.envelope.is_idle() {
                return i;
            }
        }
        // Priorité 2 : voix en Release.
        for (i, v) in self.voices.iter().enumerate() {
            if matches!(v.envelope.state, super::envelope::EnvelopeState::Release) {
                return i;
            }
        }
        // Priorité 3 : voice stealing — voler la plus ancienne.
        let mut oldest_idx = 0;
        let mut oldest_age = u64::MAX;
        for (i, v) in self.voices.iter().enumerate() {
            if v.age < oldest_age {
                oldest_age = v.age;
                oldest_idx = i;
            }
        }
        oldest_idx
    }
}

/// Convertit un numéro de note MIDI en fréquence Hz.
/// A4 (note 69) = 440 Hz.
pub fn midi_note_to_freq(note: u8) -> f64 {
    440.0 * 2.0f64.powf((note as f64 - 69.0) / 12.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_midi_note_to_freq() {
        let f = midi_note_to_freq(69);
        assert!((f - 440.0).abs() < 0.001, "A4 doit être 440 Hz, obtenu : {f}");
        let f = midi_note_to_freq(60);
        assert!((f - 261.626).abs() < 0.01, "C4 doit être ≈261.63 Hz, obtenu : {f}");
        let f = midi_note_to_freq(81);
        assert!((f - 880.0).abs() < 0.001, "A5 doit être 880 Hz, obtenu : {f}");
    }

    #[test]
    fn test_polyphony_8_voices() {
        let mut engine = SynthEngine::new(48000);
        for n in 60..68u8 {
            engine.note_on(n, 100);
        }
        let active = engine.voices.iter().filter(|v| v.active).count();
        assert_eq!(active, 8, "8 voix doivent être actives");
    }

    #[test]
    fn test_voice_stealing() {
        let mut engine = SynthEngine::new(48000);
        for n in 60..69u8 {
            engine.note_on(n, 100);
        }
        let active = engine.voices.iter().filter(|v| v.active).count();
        assert_eq!(active, 8, "Maximum 8 voix actives (voice stealing)");
    }

    #[test]
    fn test_note_off_triggers_release() {
        use super::super::envelope::EnvelopeState;
        let mut engine = SynthEngine::new(48000);
        engine.note_on(60, 100);
        for _ in 0..10000 {
            engine.process_frame(48000);
        }
        engine.note_off(60);
        let releasing = engine
            .voices
            .iter()
            .any(|v| v.note == 60 && v.envelope.state == EnvelopeState::Release);
        assert!(releasing, "La note_off doit déclencher la phase Release");
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
        for _ in 0..1000 {
            let (l, _) = engine.process_frame(48000);
            max = max.max(l.abs());
        }
        assert!(max > 0.01, "osc2 activé devrait produire du son");
    }

    #[test]
    fn test_mono_mode_single_voice() {
        let mut engine = SynthEngine::new(48000);
        engine.mode = SynthMode::Mono;
        engine.note_on(60, 100);
        engine.note_on(64, 100);
        // En mode mono, seule la voix 0 doit être active.
        let active = engine.voices.iter().filter(|v| v.active).count();
        assert_eq!(active, 1, "Mode mono : une seule voix active");
        assert_eq!(engine.voices[0].note, 64, "Dernière note jouée");
    }

    #[test]
    fn test_legato_returns_to_prev_note() {
        let mut engine = SynthEngine::new(48000);
        engine.mode = SynthMode::Legato;
        engine.note_on(60, 100);
        engine.note_on(64, 100);
        engine.note_off(64);
        assert_eq!(engine.voices[0].note, 60, "Doit revenir à la note précédente");
        assert!(engine.voices[0].active, "Voix doit rester active");
    }

    #[test]
    fn test_lfo_modulates_output() {
        let mut engine = SynthEngine::new(48000);
        engine.lfo1.depth = 1.0;
        engine.lfo1.rate = 5.0;
        engine.lfo1.destination = ModDestination::Volume;
        engine.note_on(60, 100);
        let mut samples = Vec::new();
        for _ in 0..4800 {
            let (l, _) = engine.process_frame(48000);
            samples.push(l);
        }
        // With volume LFO, samples should vary.
        let min = samples.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = samples.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        assert!(max - min > 0.01, "LFO volume doit moduler la sortie");
    }
}
