# 🎵 Music Studio — Cahier des charges Phase 0 : Architecture Fondation

## Résumé

Ce document décrit l'architecture de base de **Music Studio**, une application DAW (Digital Audio Workstation) ludique, pédagogique et évolutive. L'application est construite avec **Tauri v2** (React + TypeScript en frontend, Rust en backend). Elle tourne sur **Linux (Ubuntu/Budgie)** et **Windows**.

L'ensemble des fonctionnalités est développé dès le départ, mais un **système de niveaux** (1 à 5) permet d'afficher progressivement les modules et options dans l'interface.

---

## Stack technique

| Couche | Technologie | Rôle |
|---|---|---|
| Framework desktop | **Tauri v2** | Empaquetage natif, IPC front↔back |
| Frontend | **React 18+ / TypeScript** | Interface utilisateur |
| State management | **Zustand** | État global de l'application |
| UI components | **Radix UI** + CSS Modules | Composants accessibles, stylés sur mesure |
| Backend | **Rust** | Moteur audio, MIDI, DSP, gestion fichiers |
| Audio bas niveau | **cpal** | Accès aux périphériques audio (ALSA/PulseAudio/WASAPI) |
| DSP | **fundsp** | Traitement du signal (synthèse, effets) |
| MIDI | **midir** | Communication avec contrôleurs MIDI externes |
| Formats audio | **hound** (WAV), **symphonia** (décodage multi-formats) | Lecture/écriture de fichiers audio |
| Sérialisation | **serde / serde_json** | Sauvegarde/chargement des projets |

---

## Système de niveaux (concept central)

### Principe

Le système de niveaux contrôle la **visibilité** des fonctionnalités dans l'interface. Ce n'est PAS un système de droits : toutes les fonctionnalités existent dans le code. Un projet créé au niveau 5 peut être ouvert au niveau 1 (seuls les éléments du niveau 1 seront visibles/éditables, les autres seront lus normalement au playback mais non affichés).

### Implémentation

```typescript
// types/levels.ts
export type FeatureLevel = 1 | 2 | 3 | 4 | 5;

export interface LevelConfig {
  level: FeatureLevel;
  label: string;
  description: string;
  icon: string; // emoji ou icône
  color: string; // couleur thème associée au niveau
}

export const LEVEL_CONFIGS: LevelConfig[] = [
  { level: 1, label: "Découverte",     description: "Pads sonores et timeline simple",  icon: "🎒",  color: "#4CAF50" },
  { level: 2, label: "Petit Producteur", description: "Boîte à rythmes et séquenceur",   icon: "🥁",  color: "#2196F3" },
  { level: 3, label: "Mélodiste",       description: "Piano roll et premiers synthés",    icon: "🎹",  color: "#9C27B0" },
  { level: 4, label: "Studio",          description: "Mixage, effets et enregistrement",  icon: "🎛️", color: "#FF9800" },
  { level: 5, label: "Producteur Pro",  description: "Synthèse avancée et mastering",     icon: "🚀",  color: "#F44336" },
];
```

```typescript
// hooks/useFeatureLevel.ts
// Hook central qui détermine si un composant/feature doit s'afficher
export function useFeatureLevel() {
  const currentLevel = useSettingsStore(s => s.level);

  const isVisible = (requiredLevel: FeatureLevel): boolean => {
    return currentLevel >= requiredLevel;
  };

  const isEnabled = (requiredLevel: FeatureLevel): boolean => {
    return currentLevel >= requiredLevel;
  };

  return { currentLevel, isVisible, isEnabled };
}
```

```typescript
// Utilisation dans n'importe quel composant :
function Toolbar() {
  const { isVisible } = useFeatureLevel();

  return (
    <div className="toolbar">
      {/* Toujours visible */}
      <PlayButton />
      <StopButton />

      {/* Visible à partir du niveau 2 */}
      {isVisible(2) && <TempoControl />}

      {/* Visible à partir du niveau 4 */}
      {isVisible(4) && <RecordButton />}
    </div>
  );
}
```

### Profils utilisateurs

L'application supporte **plusieurs profils** (ex: "Papa" en niveau 5, "Prénom enfant" en niveau 1). Chaque profil a son propre niveau. Le changement de profil est protégé par un code simple (non un mot de passe — juste pour éviter qu'un enfant change de profil par accident, par ex. résoudre une petite addition).

```typescript
// types/profile.ts
export interface UserProfile {
  id: string;
  name: string;
  avatar: string;       // emoji ou image
  level: FeatureLevel;
  parentCode?: string;  // code simple pour accéder aux niveaux 4-5
  theme: "light" | "dark" | "colorful"; // "colorful" = thème enfant
  createdAt: string;
}
```

---

## Architecture Rust — Moteur Audio

### Vue d'ensemble

Le moteur audio Rust est le cœur de l'application. Il tourne sur un **thread audio dédié** à haute priorité, séparé du thread principal (qui gère l'IPC avec le frontend).

```
Thread Principal (Tauri)
    │
    ├── Reçoit les commandes du frontend via invoke()
    ├── Envoie des événements au frontend via emit()
    │
    └── Communique avec le Thread Audio via un canal lock-free
            │
            ▼
Thread Audio (haute priorité)
    │
    ├── Callback cpal (appelé ~1000x/sec pour remplir le buffer)
    ├── AudioGraph : graphe de nœuds de traitement
    │     ├── SamplerNode (lecture de samples)
    │     ├── SynthNode (génération de son)
    │     ├── DrumRackNode (boîte à rythmes)
    │     ├── EffectNode (reverb, delay, EQ...)
    │     ├── MixerNode (mixage des pistes)
    │     └── MasterNode (sortie finale)
    │
    └── Écrit dans le buffer de sortie cpal
```

### Communication lock-free

**Concept important** : le thread audio ne doit JAMAIS attendre (pas de mutex, pas d'allocation mémoire). On utilise des canaux **lock-free** (type `ringbuf` ou `crossbeam`) pour envoyer des commandes du thread principal vers le thread audio.

```rust
// audio/commands.rs
pub enum AudioCommand {
    // Transport
    Play,
    Pause,
    Stop,
    SetPosition(f64),        // en beats
    SetTempo(f64),           // BPM

    // Samples
    LoadSample { track_id: u32, sample_id: u32, path: String },
    TriggerPad { pad_id: u32 },

    // Pistes
    SetTrackVolume { track_id: u32, volume: f32 },
    SetTrackPan { track_id: u32, pan: f32 },
    MuteTrack { track_id: u32, muted: bool },

    // Effets
    AddEffect { track_id: u32, effect_type: EffectType },
    SetEffectParam { track_id: u32, effect_id: u32, param: String, value: f32 },

    // Synth
    NoteOn { track_id: u32, note: u8, velocity: u8 },
    NoteOff { track_id: u32, note: u8 },

    // Global
    SetMasterVolume(f32),
}
```

### AudioGraph (graphe de traitement)

Le cœur du moteur. Chaque piste est une chaîne de nœuds :

```rust
// audio/graph.rs
pub trait AudioNode: Send {
    /// Remplit le buffer de sortie. Appelé à chaque cycle audio.
    fn process(&mut self, buffer: &mut [f32], sample_rate: u32, tempo: f64, position: f64);

    /// Réinitialise l'état interne du nœud
    fn reset(&mut self);
}
```

### Configuration audio

```rust
// audio/config.rs
pub struct AudioConfig {
    pub sample_rate: u32,       // 44100 ou 48000
    pub buffer_size: u32,       // 256 ou 512 frames (compromis latence/stabilité)
    pub channels: u16,          // 2 (stéréo)
    pub bit_depth: u16,         // 32 (float interne)
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48000,
            buffer_size: 512,
            channels: 2,
            bit_depth: 32,
        }
    }
}
```

---

## Architecture Frontend — Structure des composants

```
src/
├── App.tsx                      # Layout principal, routing
├── main.tsx                     # Point d'entrée React
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx         # Structure globale (header, sidebar, main)
│   │   ├── Sidebar.tsx          # Navigation modules
│   │   ├── Header.tsx           # Transport, profil, niveau
│   │   └── ProfileSwitcher.tsx  # Sélection du profil utilisateur
│   │
│   ├── transport/
│   │   ├── TransportBar.tsx     # Play/Stop/Record/Tempo/Position
│   │   └── BpmControl.tsx       # Contrôle du tempo
│   │
│   ├── timeline/                # [Niveau 1+]
│   │   ├── Timeline.tsx         # Conteneur principal
│   │   ├── Track.tsx            # Une piste
│   │   ├── Clip.tsx             # Un clip audio/midi sur la piste
│   │   ├── Playhead.tsx         # Curseur de lecture
│   │   └── TimeRuler.tsx        # Règle temporelle (mesures/temps)
│   │
│   ├── sound-pad/               # [Niveau 1+]
│   │   ├── SoundPadGrid.tsx     # Grille de pads
│   │   └── SoundPad.tsx         # Un pad individuel
│   │
│   ├── drum-rack/               # [Niveau 2+]
│   │   ├── DrumRack.tsx         # Boîte à rythmes
│   │   ├── DrumPad.tsx          # Un pad de drum
│   │   └── StepSequencer.tsx    # Séquenceur pas-à-pas
│   │
│   ├── piano-roll/              # [Niveau 3+]
│   │   ├── PianoRoll.tsx        # Éditeur de notes MIDI
│   │   ├── NoteGrid.tsx         # Grille de notes
│   │   ├── PianoKeys.tsx        # Clavier vertical
│   │   └── NoteBlock.tsx        # Une note individuelle
│   │
│   ├── mixer/                   # [Niveau 4+]
│   │   ├── Mixer.tsx            # Console de mixage
│   │   ├── ChannelStrip.tsx     # Une tranche (volume, pan, mute, solo)
│   │   ├── MasterStrip.tsx      # Tranche master
│   │   └── VuMeter.tsx          # Indicateur de niveau
│   │
│   ├── effects/                 # [Niveau 4+]
│   │   ├── EffectRack.tsx       # Chaîne d'effets d'une piste
│   │   ├── EffectSlot.tsx       # Un slot d'effet
│   │   └── effects/
│   │       ├── ReverbUI.tsx
│   │       ├── DelayUI.tsx
│   │       ├── EqUI.tsx
│   │       └── CompressorUI.tsx
│   │
│   ├── synth/                   # [Niveau 3+ basique, Niveau 5 complet]
│   │   ├── SynthPanel.tsx       # Panneau synthétiseur
│   │   ├── OscillatorUI.tsx     # Contrôle des oscillateurs
│   │   ├── FilterUI.tsx         # Contrôle du filtre
│   │   ├── EnvelopeUI.tsx       # Enveloppe ADSR
│   │   └── WaveformDisplay.tsx  # Visualisation de la forme d'onde
│   │
│   ├── sample-browser/          # [Niveau 1+]
│   │   ├── SampleBrowser.tsx    # Navigateur de sons
│   │   ├── SampleList.tsx       # Liste de samples
│   │   ├── SamplePreview.tsx    # Prévisualisation audio
│   │   └── CategoryFilter.tsx   # Filtrage par catégorie
│   │
│   ├── mastering/               # [Niveau 5]
│   │   ├── MasteringPanel.tsx   # Panneau de mastering
│   │   ├── LimiterUI.tsx
│   │   ├── MasterEqUI.tsx
│   │   └── LoudnessMeter.tsx    # Mesure LUFS
│   │
│   └── shared/                  # Composants réutilisables
│       ├── Knob.tsx             # Potentiomètre rotatif
│       ├── Fader.tsx            # Fader linéaire
│       ├── Button.tsx
│       ├── WaveformView.tsx     # Affichage d'une forme d'onde
│       ├── LevelGate.tsx        # Wrapper qui masque selon le niveau
│       └── DragDrop.tsx         # Système de drag & drop
│
├── hooks/
│   ├── useAudioEngine.ts       # Communication avec le moteur Rust
│   ├── useFeatureLevel.ts      # Gestion du niveau courant
│   ├── useTransport.ts         # Contrôles play/stop/position
│   ├── useMidi.ts              # Événements MIDI
│   └── useProject.ts           # Sauvegarde/chargement
│
├── stores/
│   ├── settingsStore.ts        # Profil, niveau, préférences audio
│   ├── projectStore.ts         # État du projet courant
│   ├── transportStore.ts       # État du transport (playing, position, bpm)
│   ├── tracksStore.ts          # Pistes et clips
│   └── mixerStore.ts           # État du mixer
│
├── types/
│   ├── levels.ts               # Types du système de niveaux
│   ├── audio.ts                # Types audio (Sample, Clip, Effect...)
│   ├── midi.ts                 # Types MIDI
│   ├── project.ts              # Type Project
│   └── profile.ts              # Type UserProfile
│
├── utils/
│   ├── tauri-commands.ts       # Wrappers typés pour les invoke() Tauri
│   └── audio-utils.ts          # Utilitaires (conversion, formatage temps)
│
└── styles/
    ├── global.css              # Variables CSS, reset, thèmes
    ├── themes/
    │   ├── light.css
    │   ├── dark.css
    │   └── colorful.css        # Thème enfant (couleurs vives, arrondis)
    └── components/             # CSS Modules par composant
```

---

## Structure Rust

```
src-tauri/
├── src/
│   ├── main.rs                 # Point d'entrée Tauri, déclaration des commandes
│   ├── lib.rs                  # Exports des modules
│   │
│   ├── audio/
│   │   ├── mod.rs              # Exports du module audio
│   │   ├── engine.rs           # AudioEngine : init cpal, gestion du thread audio
│   │   ├── graph.rs            # AudioGraph : graphe de nœuds, routing
│   │   ├── buffer.rs           # RingBuffer, gestion mémoire audio
│   │   ├── commands.rs         # Enum AudioCommand (messages lock-free)
│   │   └── config.rs           # AudioConfig (sample rate, buffer size...)
│   │
│   ├── sampler/
│   │   ├── mod.rs
│   │   ├── sampler.rs          # Lecture de samples, pitch shift basique
│   │   ├── sample_bank.rs      # Chargement/cache des samples en mémoire
│   │   └── clip.rs             # AudioClip : portion de sample sur la timeline
│   │
│   ├── synth/
│   │   ├── mod.rs
│   │   ├── oscillator.rs       # Oscillateurs (sine, square, saw, triangle, noise)
│   │   ├── envelope.rs         # Enveloppe ADSR
│   │   ├── filter.rs           # Filtres (low-pass, high-pass, band-pass)
│   │   ├── voice.rs            # Voix de polyphonie
│   │   └── synth_engine.rs     # Moteur de synthèse complet
│   │
│   ├── drums/
│   │   ├── mod.rs
│   │   ├── drum_rack.rs        # DrumRack : mapping pads → samples
│   │   ├── pattern.rs          # Pattern de séquenceur pas-à-pas
│   │   └── sequencer.rs        # Moteur de séquencement
│   │
│   ├── effects/
│   │   ├── mod.rs
│   │   ├── reverb.rs           # Réverbération (algorithme Freeverb ou similaire)
│   │   ├── delay.rs            # Delay/Echo
│   │   ├── eq.rs               # Égaliseur paramétrique
│   │   ├── compressor.rs       # Compresseur dynamique
│   │   ├── limiter.rs          # Limiteur (mastering)
│   │   └── effect_chain.rs     # Chaîne d'effets sérialisable
│   │
│   ├── midi/
│   │   ├── mod.rs
│   │   ├── midi_engine.rs      # Gestion des périphériques MIDI (midir)
│   │   ├── midi_events.rs      # Types d'événements MIDI
│   │   └── midi_mapping.rs     # Mapping MIDI → actions
│   │
│   ├── mixer/
│   │   ├── mod.rs
│   │   ├── mixer.rs            # Mixeur : routing des pistes vers le master
│   │   ├── channel.rs          # Canal : volume, pan, mute, solo, inserts
│   │   └── master.rs           # Canal master, chaîne de mastering
│   │
│   ├── transport/
│   │   ├── mod.rs
│   │   └── transport.rs        # Horloge musicale : position, tempo, métronome
│   │
│   ├── project/
│   │   ├── mod.rs
│   │   ├── project.rs          # Structure Project, sérialisation JSON
│   │   ├── file_io.rs          # Lecture/écriture fichiers projet
│   │   └── export.rs           # Export WAV/MP3
│   │
│   └── commands/
│       ├── mod.rs
│       ├── audio_commands.rs   # #[tauri::command] pour l'audio
│       ├── project_commands.rs # #[tauri::command] pour les projets
│       ├── midi_commands.rs    # #[tauri::command] pour le MIDI
│       └── settings_commands.rs # #[tauri::command] pour les préférences
│
├── Cargo.toml
└── tauri.conf.json
```

---

## Format de projet (.msp — Music Studio Project)

Les projets sont sauvegardés en JSON avec l'extension `.msp`.

```json
{
  "version": "1.0",
  "name": "Ma première chanson",
  "created_by": "profile_id",
  "bpm": 120,
  "time_signature": [4, 4],
  "sample_rate": 48000,
  "tracks": [
    {
      "id": 1,
      "name": "Drums",
      "type": "drum_rack",
      "color": "#FF5722",
      "volume": 0.8,
      "pan": 0.0,
      "muted": false,
      "solo": false,
      "clips": [],
      "patterns": [],
      "effects": [],
      "level_required": 2
    }
  ],
  "master": {
    "volume": 1.0,
    "effects": []
  }
}
```

---

## Commandes Tauri (IPC Frontend ↔ Backend)

Voici le contrat d'interface. Le frontend appelle ces fonctions via `invoke()` :

```rust
// Transport
#[tauri::command] fn play() -> Result<(), String>;
#[tauri::command] fn pause() -> Result<(), String>;
#[tauri::command] fn stop() -> Result<(), String>;
#[tauri::command] fn set_bpm(bpm: f64) -> Result<(), String>;
#[tauri::command] fn get_position() -> Result<f64, String>;

// Samples
#[tauri::command] fn load_sample(path: String) -> Result<SampleInfo, String>;
#[tauri::command] fn trigger_pad(pad_id: u32) -> Result<(), String>;
#[tauri::command] fn list_samples(category: String) -> Result<Vec<SampleInfo>, String>;

// Pistes
#[tauri::command] fn add_track(track_type: String) -> Result<u32, String>;
#[tauri::command] fn remove_track(track_id: u32) -> Result<(), String>;
#[tauri::command] fn set_track_volume(track_id: u32, volume: f32) -> Result<(), String>;
#[tauri::command] fn set_track_pan(track_id: u32, pan: f32) -> Result<(), String>;

// Clips
#[tauri::command] fn add_clip(track_id: u32, sample_id: u32, position: f64, duration: f64) -> Result<u32, String>;
#[tauri::command] fn move_clip(clip_id: u32, new_position: f64) -> Result<(), String>;
#[tauri::command] fn delete_clip(clip_id: u32) -> Result<(), String>;

// Drum Rack
#[tauri::command] fn set_drum_pattern(track_id: u32, pattern: DrumPattern) -> Result<(), String>;

// Synthé / Notes MIDI
#[tauri::command] fn note_on(track_id: u32, note: u8, velocity: u8) -> Result<(), String>;
#[tauri::command] fn note_off(track_id: u32, note: u8) -> Result<(), String>;
#[tauri::command] fn add_midi_note(track_id: u32, note: u8, start: f64, duration: f64, velocity: u8) -> Result<u32, String>;

// Effets
#[tauri::command] fn add_effect(track_id: u32, effect_type: String) -> Result<u32, String>;
#[tauri::command] fn set_effect_param(track_id: u32, effect_id: u32, param: String, value: f32) -> Result<(), String>;
#[tauri::command] fn remove_effect(track_id: u32, effect_id: u32) -> Result<(), String>;

// Projet
#[tauri::command] fn new_project(name: String) -> Result<(), String>;
#[tauri::command] fn save_project(path: String) -> Result<(), String>;
#[tauri::command] fn load_project(path: String) -> Result<ProjectInfo, String>;
#[tauri::command] fn export_audio(path: String, format: String) -> Result<(), String>;

// Paramètres
#[tauri::command] fn get_audio_devices() -> Result<Vec<AudioDevice>, String>;
#[tauri::command] fn set_audio_device(device_name: String) -> Result<(), String>;
#[tauri::command] fn set_buffer_size(size: u32) -> Result<(), String>;
```

---

## Conventions de développement

### Pour Claude Code — Règles impératives

1. **Chaque module Rust** doit implémenter le trait `AudioNode` s'il produit ou transforme de l'audio.
2. **Aucune allocation mémoire** dans le callback audio (`process()`). Toute la mémoire est pré-allouée.
3. **Communication front↔back** exclusivement via les `#[tauri::command]` et `emit()`. Jamais d'accès fichier depuis le frontend.
4. **Chaque composant React** qui dépend d'un niveau doit utiliser le hook `useFeatureLevel()` ou le wrapper `<LevelGate level={N}>`.
5. **Tests** : chaque module Rust doit avoir des tests unitaires. Chaque commande Tauri doit être testable indépendamment.
6. **Nommage** : snake_case en Rust, camelCase en TypeScript, PascalCase pour les composants React.
7. **Pas de `unwrap()`** en Rust sauf dans les tests. Utiliser `Result<T, E>` partout.
8. **Format audio interne** : f32, 48000 Hz, stéréo (2 canaux entrelacés).
