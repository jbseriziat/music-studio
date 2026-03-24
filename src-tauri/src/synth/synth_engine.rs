use super::oscillator::Waveform;
use super::voice::SynthVoice;
use super::SynthPreset;

/// Moteur de synthèse soustractif à 8 voix polyphoniques.
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
        };
        // Initialiser toutes les voix avec les paramètres du preset.
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
                // 0=Sine, 1=Square, 2=Sawtooth, 3=Triangle
                let wf = match value as u32 {
                    1 => Waveform::Square,
                    2 => Waveform::Sawtooth,
                    3 => Waveform::Triangle,
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
            _ => {
                eprintln!("[SynthEngine] Paramètre inconnu : {param}");
            }
        }
    }

    // ── Notes ─────────────────────────────────────────────────────────────────

    /// Déclenche une note (note pressée). Gère le voice stealing automatiquement.
    pub fn note_on(&mut self, note: u8, velocity: u8) {
        self.voice_counter += 1;
        let vel_f = velocity as f32 / 127.0;
        let idx = self.find_free_voice();
        let voice = &mut self.voices[idx];

        voice.note = note;
        voice.velocity = vel_f;
        voice.oscillator.set_frequency(midi_note_to_freq(note));
        voice.oscillator.reset();
        voice.filter.reset();
        voice.envelope.trigger();
        voice.active = true;
        voice.age = self.voice_counter;
    }

    /// Relâche une note (note relâchée). Déclenche la phase Release de l'enveloppe.
    pub fn note_off(&mut self, note: u8) {
        for voice in &mut self.voices {
            if voice.active && voice.note == note {
                voice.envelope.release();
            }
        }
    }

    // ── Génération audio ──────────────────────────────────────────────────────

    /// Génère exactement une frame stéréo. Retourne (left, right).
    /// Appelé depuis le callback audio (once per output frame).
    pub fn process_frame(&mut self, sample_rate: u32) -> (f32, f32) {
        let mut sample = 0.0f32;
        for voice in &mut self.voices {
            if voice.active {
                sample += voice.process(sample_rate);
                if voice.envelope.is_idle() {
                    voice.active = false;
                }
            }
        }
        sample *= self.master_volume;
        (sample, sample)
    }

    // ── Utilitaires ───────────────────────────────────────────────────────────

    /// Remet toutes les voix à zéro (sans dés/réallocation).
    pub fn reset(&mut self) {
        for voice in &mut self.voices {
            voice.reset();
        }
        self.voice_counter = 0;
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
        // A4 = 440 Hz
        let f = midi_note_to_freq(69);
        assert!((f - 440.0).abs() < 0.001, "A4 doit être 440 Hz, obtenu : {f}");
        // C4 = 261.63 Hz
        let f = midi_note_to_freq(60);
        assert!((f - 261.626).abs() < 0.01, "C4 doit être ≈261.63 Hz, obtenu : {f}");
        // Octave : A5 = 880 Hz
        let f = midi_note_to_freq(81);
        assert!((f - 880.0).abs() < 0.001, "A5 doit être 880 Hz, obtenu : {f}");
    }

    #[test]
    fn test_polyphony_8_voices() {
        let mut engine = SynthEngine::new(48000);
        // Déclencher 8 notes différentes.
        for n in 60..68u8 {
            engine.note_on(n, 100);
        }
        // Toutes les voix doivent être actives.
        let active = engine.voices.iter().filter(|v| v.active).count();
        assert_eq!(active, 8, "8 voix doivent être actives");
    }

    #[test]
    fn test_voice_stealing() {
        let mut engine = SynthEngine::new(48000);
        // Déclencher 9 notes → voice stealing doit se produire.
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
        // Avancer suffisamment pour sortir de l'attack.
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
        // Pas de notes actives → sortie silencieuse.
        let (l, r) = engine.process_frame(48000);
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);
    }
}
