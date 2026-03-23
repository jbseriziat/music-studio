# Music Studio — DAW pédagogique et évolutive

## Résumé du projet
Application de type DAW (Digital Audio Workstation) ludique et pédagogique pour créer de la musique. L'application dispose d'un système de niveaux (1 à 5) qui masque progressivement les fonctionnalités dans l'interface. Toutes les fonctionnalités existent dans le code, seule la visibilité change selon le profil utilisateur.

## Stack technique
- **Framework desktop** : Tauri v2
- **Frontend** : React 18 + TypeScript
- **State management** : Zustand
- **UI** : Radix UI + CSS Modules
- **Backend** : Rust
- **Audio** : cpal (périphériques), fundsp (DSP), hound (WAV), symphonia (décodage multi-formats)
- **MIDI** : midir
- **Sérialisation** : serde / serde_json

## Cibles
- Linux Ubuntu/Budgie (ALSA/PulseAudio/PipeWire)
- Windows (WASAPI)

## Commandes
- `cargo tauri dev` — lance l'application complète en mode développement
- `npm run dev` — lance uniquement le frontend React
- `cargo test` — exécute les tests Rust
- `npm run test` — exécute les tests frontend
- `cargo build --release` — build de production Rust
- `cargo tauri build` — build de l'installeur final

## Architecture clé

### Communication frontend ↔ backend
EXCLUSIVEMENT via les `#[tauri::command]` (frontend → Rust) et `emit()` (Rust → frontend). Jamais d'accès fichier depuis le frontend.

### Thread audio
Le moteur audio tourne sur un thread dédié haute priorité. Communication avec le thread principal via un canal **lock-free** (ringbuf). AUCUNE allocation mémoire dans le callback audio. AUCUN mutex dans le callback audio.

### Format audio interne
f32, 48000 Hz, stéréo (2 canaux entrelacés), buffer 512 frames.

### Système de niveaux
Chaque composant React dépendant d'un niveau utilise `<LevelGate level={N}>` ou le hook `useFeatureLevel()`. Les niveaux vont de 1 (Découverte) à 5 (Producteur Pro).

## Conventions de code

### Rust
- snake_case pour les variables et fonctions
- Pas de `unwrap()` sauf dans les tests — utiliser `Result<T, E>` partout
- Chaque module audio implémente le trait `AudioNode` s'il produit ou transforme du son
- Chaque module a des tests unitaires

### TypeScript / React
- camelCase pour les variables et fonctions
- PascalCase pour les composants React
- Un composant = un fichier
- Les stores Zustand sont dans `src/stores/`
- Les types partagés sont dans `src/types/`

### Structure des dossiers
- `src/` — frontend React
- `src-tauri/src/` — backend Rust
- `src-tauri/src/audio/` — moteur audio (engine, graph, buffer, config)
- `src-tauri/src/sampler/` — lecture de samples
- `src-tauri/src/synth/` — synthétiseur
- `src-tauri/src/drums/` — drum rack et séquenceur
- `src-tauri/src/effects/` — effets audio (reverb, delay, EQ, compressor)
- `src-tauri/src/midi/` — gestion MIDI
- `src-tauri/src/mixer/` — mixage et mastering
- `src-tauri/src/transport/` — horloge musicale et métronome
- `src-tauri/src/project/` — sauvegarde/chargement/export
- `samples/` — sons embarqués (WAV 48kHz 16-bit)

## Spécifications détaillées
Les specs complètes de chaque phase sont dans le dossier `docs/` :

- Architecture et système de niveaux : @docs/SPEC_PHASE_0_ARCHITECTURE.md
- Phase 1 — Sound Pads, Timeline, Transport, Sample Browser : @docs/SPEC_PHASE_1_DECOUVERTE.md
- Phase 2 — Drum Rack, Step Sequencer, BPM, Loop : @docs/SPEC_PHASE_2_PETIT_PRODUCTEUR.md
- Phase 3 — Piano Roll, Synthé, MIDI : @docs/SPEC_PHASE_3_MELODISTE.md
- Phase 4 — Mixer, Effets, Recording, Export : @docs/SPEC_PHASE_4_STUDIO.md
- Phase 5 — Synthé avancé, Mastering, Bus/Send : @docs/SPEC_PHASE_5_PRODUCTEUR_PRO.md

IMPORTANT : avant d'implémenter une tâche, lis toujours la spec de la phase correspondante ET la spec d'architecture (Phase 0).

## Phase en cours
Phase 3 — Mélodiste : Piano Roll + Synthétiseur + MIDI (voir @docs/SPEC_PHASE_3_MELODISTE.md)

## Phase 2 — ✅ TERMINÉE

Étapes réalisées :
1. ✅ BPM control (40–240), drag vertical, emojis de vitesse 🐢🚶🏃🚀
2. ✅ Drum Rack 8 pads — kit par défaut, changement de son, volume/pitch par pad
3. ✅ Kits prédéfinis (Hip-Hop, Electronic, Rock, Kids) via DrumKitSelector
4. ✅ Step Sequencer 8×16 cases, repères visuels tous les 4 steps, configurable 8/16/32
5. ✅ Curseur de lecture sur la grille (polling 40ms via `get_current_step`)
6. ✅ Mode Loop — bouton 🔁, marqueurs draggables sur la TimeRuler, reset position dans le callback
7. ✅ Métronome — accent (1000 Hz) sur le 1er temps, clic (800 Hz) sur les autres, volume indépendant
8. ✅ Mute/Solo par piste (boutons M/S, arrays `[bool; 64]` lock-free dans le callback)
9. ✅ Timeline en mesures/temps au niveau 2+ (BeatsRuler remplace SecondsRuler)
10. ✅ Zoom horizontal (Ctrl+molette, 20–600 px/s)
11. ✅ Piste DrumRack intégrée dans la timeline (DrumClip mini-grid read-only)
12. ✅ Double-clic sur la piste Drum Rack → bascule sur l'onglet Drum Rack
13. ✅ Sauvegarde/restauration du pattern drum dans .msp (`drum_pattern` + `track_type`)
14. ✅ 28 tests Rust passants, 0 erreur TypeScript

Notes d'implémentation Phase 2 :
- `samples_per_step = sample_rate × 60 / (bpm × 4)` — recalcul lock-free via `AudioCommand::SetBpm`
- Métronome synthétique généré au démarrage (IDs réservés 253/254 dans la banque de samples)
- Step cursor : overlay CSS absolu, polling `getCurrentStep()` toutes les 40ms
- Mute/Solo : `[bool; 64]` indexés par `track_id % 64`, flag `any_track_solo` pour éviter itération
- Loop : `position_frames >= loop_end_frames` → reset + prune des voix hors zone
- DrumClip : largeur = `(stepCount/4) × (60/bpm) × pixelsPerSec` (se met à jour au changement de BPM)
- `#[serde(default)]` sur `drum_pattern` et `track_type` → rétrocompatibilité avec les anciens .msp

## Phase 1 — ✅ TERMINÉE

Étapes réalisées :
1. ✅ Sound Pads 4×4 avec couleurs, icônes, animation pulse, drag & drop
2. ✅ Sample Browser (panneau latéral, catégories, prévisualisation, drag)
3. ✅ Timeline (pistes, clips avec waveform, playhead, snap-to-grid 0.5s)
4. ✅ Transport Play/Stop avec polling position 50ms
5. ✅ Moteur audio Rust complet : pads polyphoniques, clips timeline, preview
6. ✅ Génération synthétique de 16 samples WAV au premier lancement
7. ✅ Sauvegarde/chargement projet (.msp JSON)
8. ✅ Raccourcis clavier (Space, Delete, Ctrl+Z, Ctrl+S)
9. ✅ Thème colorful enfant, Radix DropdownMenu sur pads, SamplePickerDialog
10. ✅ Undo history (30 snapshots) dans tracksStore

Notes d'implémentation Phase 1 :
- Drag payload : `{ type: 'pad'|'sample', sampleId, sampleName, durationMs?, waveform? }`
- `dragEnter/Leave counter` pattern dans Track.tsx pour éviter le flickering
- `transition: left 55ms linear` sur le playhead pour lisser le polling 50ms
- CSS aliases `--color-*` → `--bg-*/--text-*/--border` dans `:root` de global.css

## Phase 0 — ✅ TERMINÉE

Étapes réalisées :
1. ✅ Projet Tauri v2 + React 18 + TypeScript + Vite initialisé
2. ✅ Dépendances Rust (cpal 0.15, ringbuf 0.4, hound 3.5, midir 0.10, serde) et JS (zustand, @radix-ui, @tauri-apps/api) configurées
3. ✅ Structure de dossiers frontend (src/components, hooks, stores, types, utils, styles) et backend (audio, sampler, synth, drums, effects, midi, mixer, transport, project, commands) créée
4. ✅ Moteur audio minimal : init cpal, thread audio haute priorité, callback silencieux, canal lock-free (ringbuf)
5. ✅ Communication IPC : ping aller-retour + commandes audio (play, pause, stop, set_master_volume, ping_audio)
6. ✅ Store Zustand settingsStore avec persist localStorage — profils, niveau courant, thème courant
7. ✅ LevelGate + useFeatureLevel — système de niveaux 1–5 fonctionnel
8. ✅ Build TypeScript 0 erreur, cargo check 0 warning, layout AppShell + Header + Sidebar + thème colorful

Notes d'implémentation :
- `cpal::Stream` est `!Send` sur Linux/ALSA → wrapper `SendableStream` avec `unsafe impl Send`
- Accès au state Tauri dans une commande : `engine.inner().lock().unwrap()`
- `data-theme="colorful"` sur `<html>` dans index.html évite le flash au chargement
- Les stores projectStore, transportStore, tracksStore, mixerStore existent comme stubs typés
