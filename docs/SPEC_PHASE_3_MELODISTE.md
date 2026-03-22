# 🎹 Music Studio — Phase 3 : "Mélodiste" — Piano Roll et Premiers Synthés

## Objectif

Introduire la création mélodique : un **piano roll** pour dessiner des notes, un **synthétiseur simple** pour générer des sons d'instruments, et le support **MIDI** pour jouer avec un clavier externe. L'enfant peut maintenant créer des mélodies et les superposer avec les rythmes.

**Niveau requis** : 3 (Mélodiste)

---

## Fonctionnalités de cette phase

### 3.1 — Piano Roll

**Description** : Éditeur de notes MIDI sous forme de grille. L'axe vertical représente les notes (do, ré, mi...) avec un clavier de piano à gauche. L'axe horizontal représente le temps (en mesures/beats). On dessine des rectangles pour créer des notes.

**Concept expliqué simplement** : c'est comme du papier quadrillé. Chaque ligne est une note de musique (en bas = sons graves, en haut = sons aigus). Tu dessines des rectangles pour dire au synthé quand jouer une note et combien de temps. Plus le rectangle est long, plus la note dure.

**Spécifications** :
- Le piano roll s'ouvre quand on double-clique sur un clip MIDI dans la timeline, ou quand on clique sur "Éditer" pour une piste instrument
- **Clavier vertical** (à gauche) : 4 octaves visibles par défaut (C2 à C6), scrollable pour accéder aux 88 touches
  - Les touches blanches et noires sont dessinées à l'échelle
  - Clic sur une touche du clavier → joue la note (preview)
  - Le nom de la note est affiché (C4, D#3, etc.)
  - Au niveau 3, option pour afficher Do Ré Mi au lieu de C D E
- **Grille de notes** :
  - Axes : notes (Y) × temps en beats (X)
  - Lignes horizontales alternent : gris clair (touches blanches) / gris foncé (touches noires)
  - Lignes verticales : séparateurs de mesures (épais) et de temps (fins)
  - Snap-to-grid : quantification à la croche (1/8) par défaut, configurable (1/4, 1/8, 1/16, 1/32)
- **Création de notes** :
  - Clic + drag horizontal → crée une note (la hauteur dépend de la position Y, la durée dépend du drag X)
  - Clic sur une note existante → sélectionne (contour lumineux)
  - Double-clic sur une note → supprime
  - Drag d'une note → déplacer (hauteur et/ou position)
  - Drag du bord droit d'une note → redimensionner (durée)
  - Sélection multiple : clic + drag dans le vide → rectangle de sélection
  - Copier/Coller de notes (Ctrl+C, Ctrl+V)
- **Vélocité** :
  - Au niveau 3 : chaque note a une vélocité (visible comme la luminosité/opacité de la note)
  - Panneau de vélocité en bas du piano roll : barres verticales par note, hauteur = vélocité
  - Clic + drag sur une barre pour ajuster la vélocité

**Structure de données** :
```typescript
interface MidiNote {
  id: string;
  note: number;        // 0-127 (MIDI standard, 60 = C4)
  start: number;       // Position en beats
  duration: number;    // Durée en beats
  velocity: number;    // 0-127
}

interface MidiClip {
  id: string;
  trackId: string;
  notes: MidiNote[];
  startInTimeline: number;  // Position du clip dans la timeline (en beats)
  length: number;            // Longueur du clip en beats
  color: string;
}
```

**Commandes Rust** :
```rust
#[tauri::command]
fn add_midi_note(track_id: u32, note: u8, start: f64, duration: f64, velocity: u8) -> Result<u32, String>
// → Ajoute une note MIDI au clip actif de la piste

#[tauri::command]
fn update_midi_note(note_id: u32, note: u8, start: f64, duration: f64, velocity: u8) -> Result<(), String>

#[tauri::command]
fn delete_midi_note(note_id: u32) -> Result<(), String>

#[tauri::command]
fn set_clip_notes(track_id: u32, clip_id: u32, notes: Vec<MidiNoteData>) -> Result<(), String>
// → Remplace toutes les notes d'un clip (pour opérations batch comme le copier/coller)
```

**Composants React** :
- `PianoRoll.tsx` — Conteneur principal (gère scroll, zoom, outil actif)
- `PianoKeys.tsx` — Clavier vertical (touches blanches et noires)
- `NoteGrid.tsx` — Canvas ou SVG pour la grille et les notes
- `NoteBlock.tsx` — Une note individuelle (si DOM) ou rendu dans le canvas
- `VelocityLane.tsx` — Barres de vélocité en bas
- `QuantizeSelector.tsx` — Sélection de la quantification (1/4, 1/8, 1/16)

**Rendu performant** : le piano roll peut contenir des centaines de notes. Deux approches possibles :
1. **Canvas HTML5** (recommandé) : rendu en canvas 2D, meilleure perf pour beaucoup de notes
2. **SVG** : plus simple à coder, suffisant pour < 200 notes

Au niveau 3, commencer par SVG. Si les performances sont insuffisantes, migrer vers Canvas.

---

### 3.2 — Synthétiseur simple

**Description** : Un synthétiseur soustractif basique qui génère des sons en temps réel. C'est l'instrument par défaut des pistes "instrument" (par opposition aux pistes "audio" qui lisent des samples et aux pistes "drum rack").

**Concept expliqué simplement** : un synthé fabrique du son à partir de formes d'onde (comme des vibrations). On choisit la forme de la vibration (douce comme une flûte, ou dure comme un buzzer), puis on la modifie avec des filtres et des enveloppes pour sculpter le son qu'on veut.

**Spécifications du synthé niveau 3** :

**Oscillateurs (1 ou 2)** :
- Formes d'onde : Sinus (douce), Carré (8-bit/rétro), Dent de scie (riche), Triangle (douce mais plus présente que sinus)
- Chaque oscillateur a : sélection de forme d'onde, réglage d'octave (-2 à +2), réglage fin de hauteur (detune, -50 à +50 cents)
- Au niveau 3, un seul oscillateur. Deuxième oscillateur au niveau 5.
- Affichage visuel de la forme d'onde en temps réel (oscilloscope simplifié)

**Enveloppe ADSR** :
- Contrôle de l'amplitude dans le temps : Attack (montée), Decay (descente), Sustain (maintien), Release (relâchement)
- Affichage graphique de la courbe ADSR (interactif : drag des points)
- Plages : Attack 1ms-5s, Decay 1ms-5s, Sustain 0-100%, Release 1ms-10s
- Valeurs par défaut "musicales" : A=10ms, D=100ms, S=70%, R=200ms

**Filtre** :
- Low-pass (passe-bas) uniquement au niveau 3
- Types additionnels au niveau 5 : High-pass, Band-pass
- Paramètres : Cutoff (fréquence de coupure, 20Hz-20kHz), Resonance (0-100%)
- Affichage de la courbe de réponse du filtre

**Polyphonie** :
- 8 voix au niveau 3 (suffisant pour jouer des accords)
- 16 voix au niveau 5
- Quand toutes les voix sont utilisées, la plus ancienne est "volée" (voice stealing)

**Presets** :
- Presets prédéfinis adaptés aux enfants : "Piano doux", "Orgue rétro", "Flûte magique", "Robot", "Sous-marin", "Étoile"
- Possibilité de sauvegarder ses propres presets au niveau 3+

**Implémentation Rust** :
```rust
// synth/oscillator.rs
pub enum Waveform {
    Sine,
    Square,
    Sawtooth,
    Triangle,
}

pub struct Oscillator {
    waveform: Waveform,
    phase: f64,
    frequency: f64,
    octave_offset: i8,     // -2 à +2
    detune_cents: f32,     // -50 à +50
}

impl Oscillator {
    pub fn generate(&mut self, sample_rate: u32) -> f32 {
        let freq = self.frequency * 2.0f64.powf(self.octave_offset as f64 + self.detune_cents as f64 / 1200.0);
        let sample = match self.waveform {
            Waveform::Sine => (self.phase * 2.0 * std::f64::consts::PI).sin(),
            Waveform::Square => if self.phase < 0.5 { 1.0 } else { -1.0 },
            Waveform::Sawtooth => 2.0 * self.phase - 1.0,
            Waveform::Triangle => 4.0 * (self.phase - (self.phase + 0.5).floor()).abs() - 1.0,
        };
        self.phase = (self.phase + freq / sample_rate as f64) % 1.0;
        sample as f32
    }
}

// synth/envelope.rs
pub struct Envelope {
    attack: f32,    // secondes
    decay: f32,     // secondes
    sustain: f32,   // 0.0 - 1.0
    release: f32,   // secondes
    state: EnvelopeState,
    level: f32,
}

pub enum EnvelopeState {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

impl Envelope {
    pub fn trigger(&mut self) {
        self.state = EnvelopeState::Attack;
        // Le level démarre de sa valeur actuelle (pas forcément 0, pour éviter les clics)
    }

    pub fn release(&mut self) {
        self.state = EnvelopeState::Release;
    }

    pub fn process(&mut self, sample_rate: u32) -> f32 {
        match self.state {
            EnvelopeState::Attack => {
                self.level += 1.0 / (self.attack * sample_rate as f32);
                if self.level >= 1.0 {
                    self.level = 1.0;
                    self.state = EnvelopeState::Decay;
                }
            },
            EnvelopeState::Decay => {
                self.level -= (1.0 - self.sustain) / (self.decay * sample_rate as f32);
                if self.level <= self.sustain {
                    self.level = self.sustain;
                    self.state = EnvelopeState::Sustain;
                }
            },
            EnvelopeState::Sustain => { /* level reste à sustain */ },
            EnvelopeState::Release => {
                self.level -= self.level / (self.release * sample_rate as f32);
                if self.level < 0.001 {
                    self.level = 0.0;
                    self.state = EnvelopeState::Idle;
                }
            },
            EnvelopeState::Idle => { self.level = 0.0; },
        }
        self.level
    }
}

// synth/filter.rs
pub struct Filter {
    filter_type: FilterType,
    cutoff: f32,        // Hz
    resonance: f32,     // 0.0 - 1.0
    // État interne (biquad)
    x1: f32, x2: f32,
    y1: f32, y2: f32,
}

pub enum FilterType {
    LowPass,
    HighPass,    // niveau 5
    BandPass,    // niveau 5
}

// synth/voice.rs
pub struct SynthVoice {
    oscillator: Oscillator,
    envelope: Envelope,
    filter: Filter,
    note: u8,
    active: bool,
}

// synth/synth_engine.rs
pub struct SynthEngine {
    voices: Vec<SynthVoice>,   // 8 ou 16 voix
    preset: SynthPreset,
    master_volume: f32,
}

impl SynthEngine {
    pub fn note_on(&mut self, note: u8, velocity: u8) {
        // Trouver une voix libre (ou voler la plus ancienne)
        let voice = self.find_free_voice();
        voice.note = note;
        voice.oscillator.frequency = midi_note_to_freq(note);
        voice.envelope.trigger();
        voice.active = true;
    }

    pub fn note_off(&mut self, note: u8) {
        // Trouver la voix jouant cette note et déclencher le release
        for voice in &mut self.voices {
            if voice.active && voice.note == note {
                voice.envelope.release();
            }
        }
    }

    pub fn process(&mut self, buffer: &mut [f32], sample_rate: u32) {
        for frame in buffer.chunks_mut(2) {
            let mut sample = 0.0f32;
            for voice in &mut self.voices {
                if voice.active {
                    let osc = voice.oscillator.generate(sample_rate);
                    let env = voice.envelope.process(sample_rate);
                    let filtered = voice.filter.process(osc * env);
                    sample += filtered;

                    if voice.envelope.is_idle() {
                        voice.active = false;
                    }
                }
            }
            sample *= self.master_volume;
            frame[0] += sample;
            frame[1] += sample;
        }
    }
}

fn midi_note_to_freq(note: u8) -> f64 {
    440.0 * 2.0f64.powf((note as f64 - 69.0) / 12.0)
}
```

**Commandes Rust** :
```rust
#[tauri::command]
fn create_synth_track(name: String) -> Result<u32, String>
// → Crée une piste instrument avec un synthé par défaut

#[tauri::command]
fn note_on(track_id: u32, note: u8, velocity: u8) -> Result<(), String>
// → Joue une note immédiatement (jeu live ou preview)

#[tauri::command]
fn note_off(track_id: u32, note: u8) -> Result<(), String>

#[tauri::command]
fn set_synth_param(track_id: u32, param: String, value: f32) -> Result<(), String>
// Params: "waveform", "attack", "decay", "sustain", "release", "cutoff", "resonance", "octave", "detune"

#[tauri::command]
fn load_synth_preset(track_id: u32, preset_name: String) -> Result<(), String>

#[tauri::command]
fn save_synth_preset(track_id: u32, preset_name: String) -> Result<(), String>

#[tauri::command]
fn list_synth_presets() -> Result<Vec<PresetInfo>, String>
```

**Composants React** :
- `SynthPanel.tsx` — Panneau complet du synthé (s'affiche quand on sélectionne une piste instrument)
- `OscillatorUI.tsx` — Sélection de forme d'onde (4 boutons visuels avec la forme dessinée) + octave + detune
- `EnvelopeUI.tsx` — Affichage graphique ADSR avec knobs ou points draggables
- `FilterUI.tsx` — Knob cutoff + knob resonance + courbe de réponse
- `WaveformDisplay.tsx` — Mini oscilloscope montrant la forme d'onde en temps réel
- `PresetSelector.tsx` — Liste déroulante de presets avec boutons sauvegarder/charger

---

### 3.3 — Support MIDI externe

**Description** : Permettre de brancher un clavier MIDI USB et jouer les instruments du projet en temps réel.

**Spécifications** :
- Détection automatique des périphériques MIDI connectés
- Notification quand un clavier est branché/débranché
- Le clavier MIDI joue l'instrument de la piste sélectionnée (synthé ou drum rack)
- Mapping basique : les notes MIDI → notes du synthé / pads du drum rack
- Indicateur dans la barre de transport : icône MIDI qui clignote quand des données arrivent
- Configuration dans les paramètres : sélection du périphérique MIDI d'entrée

**Commandes Rust** :
```rust
#[tauri::command]
fn list_midi_devices() -> Result<Vec<MidiDeviceInfo>, String>

#[tauri::command]
fn connect_midi_device(device_name: String) -> Result<(), String>

#[tauri::command]
fn disconnect_midi_device() -> Result<(), String>
```

**Implémentation Rust** :
```rust
// midi/midi_engine.rs
pub struct MidiEngine {
    connection: Option<MidiInputConnection>,
    // Le callback MIDI envoie les événements via un canal vers le thread audio
    event_sender: Producer<MidiEvent>,
}

pub enum MidiEvent {
    NoteOn { channel: u8, note: u8, velocity: u8 },
    NoteOff { channel: u8, note: u8 },
    ControlChange { channel: u8, controller: u8, value: u8 },
}
```

---

### 3.4 — Améliorations de la Timeline (niveau 3)

**Nouveautés** :
- Nouveau type de piste : **Instrument** (icône clavier) en plus d'Audio et Drum Rack
- Les clips MIDI sont affichés avec une mini vue "piano roll" dans le clip (notes en miniature)
- Nombre de pistes : illimité (scrollable)
- Possibilité de dupliquer un clip (Alt + drag)
- Possibilité de redimensionner un clip (drag du bord droit)
- Patterns multiples pour le Drum Rack (A, B, C...) plaçables sur la timeline
- Import de fichiers audio : glisser un fichier WAV/MP3/OGG depuis l'explorateur système vers la timeline

**Composants React** :
- `MidiClip.tsx` — Clip MIDI montrant les notes en miniature
- `InstrumentTrackHeader.tsx` — Header de piste avec sélecteur de preset synthé

---

### 3.5 — Améliorations Step Sequencer (niveau 3)

**Nouveautés** :
- Vélocité par step : clic + drag vertical sur une case pour ajuster la vélocité (indiquée par l'opacité/hauteur d'un indicateur dans la case)
- Patterns multiples (A, B, C, D) avec onglets
- Possibilité de chaîner les patterns : A → A → B → A (dans un mini séquenceur de patterns)
- Step count configurable : 8, 16, 24, 32

---

### 3.6 — Clavier virtuel

**Description** : En plus du piano roll et du clavier MIDI physique, un clavier virtuel permet de jouer des notes avec le clavier d'ordinateur.

**Spécifications** :
- Mapping AZERTY par défaut (adapter pour QWERTY) :
  - Rangée A-S-D-F-G-H-J-K → notes C-D-E-F-G-A-B-C (touches blanches)
  - Rangée Z-E-R-T-Y-U-I → C#-D#-F#-G#-A#-C#-D# (touches noires)
  - W et X : octave -/+
- Le clavier virtuel est affiché en bas de l'écran (optionnel, toggle)
- Les touches s'illuminent quand on les presse
- Vélocité fixe à 100 pour le clavier d'ordinateur (pas de sensibilité)

**Composants React** :
- `VirtualKeyboard.tsx` — Clavier visuel cliquable et lié aux touches du clavier
- `KeyboardKey.tsx` — Une touche (blanche ou noire)

---

## Mise à jour du moteur audio

### Nouveau type de piste dans l'audio graph

```rust
pub enum TrackType {
    Audio,
    DrumRack,
    Instrument,   // NOUVEAU : piste avec synthé
}

pub struct Track {
    // ... champs existants ...

    // Pour les pistes Instrument
    pub synth: Option<SynthEngine>,
    pub midi_clips: Vec<MidiClip>,
}
```

### Lecture des clips MIDI dans le callback audio

```rust
// Dans le callback audio, pour chaque piste Instrument :
TrackType::Instrument => {
    if let Some(ref mut synth) = track.synth {
        // Vérifier les notes MIDI qui doivent commencer ou se terminer à cette position
        for clip in &track.midi_clips {
            for note in &clip.notes {
                let note_start = clip.start + note.start;
                let note_end = note_start + note.duration;

                if is_at_position(state.position, note_start) {
                    synth.note_on(note.note, note.velocity);
                }
                if is_at_position(state.position, note_end) {
                    synth.note_off(note.note);
                }
            }
        }

        // Traiter les événements MIDI live (clavier physique/virtuel)
        while let Some(midi_event) = midi_receiver.try_pop() {
            match midi_event {
                MidiEvent::NoteOn { note, velocity, .. } => synth.note_on(note, velocity),
                MidiEvent::NoteOff { note, .. } => synth.note_off(note),
                _ => {}
            }
        }

        // Générer l'audio du synthé
        synth.process(temp_buffer, state.sample_rate);
        // Mixer dans la sortie
        for i in 0..buffer_len {
            left += temp_buffer[i * 2] * track.volume * pan_left(track.pan);
            right += temp_buffer[i * 2 + 1] * track.volume * pan_right(track.pan);
        }
    }
}
```

---

## Checklist de validation Phase 3

- [ ] Le piano roll s'ouvre et affiche une grille correcte avec le clavier vertical
- [ ] On peut créer des notes par clic + drag
- [ ] On peut déplacer, redimensionner et supprimer des notes
- [ ] La quantification (snap) fonctionne
- [ ] La vélocité est affichée et modifiable
- [ ] Le synthé joue des sons quand on clique sur le clavier du piano roll
- [ ] Les 4 formes d'onde sont disponibles et sonnent différemment
- [ ] L'enveloppe ADSR modifie le son de manière audible
- [ ] Le filtre low-pass fonctionne (on entend la coupure des aigus)
- [ ] Les presets se chargent et s'appliquent correctement
- [ ] Un clavier MIDI externe est détecté et joue les notes
- [ ] Le clavier virtuel (clavier d'ordinateur) fonctionne
- [ ] Les clips MIDI sont joués correctement pendant la lecture de la timeline
- [ ] On peut créer des pistes Instrument et les mixer avec les pistes Audio et DrumRack
- [ ] Les notes MIDI sont sauvegardées avec le projet
