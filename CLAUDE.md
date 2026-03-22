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
Phase 1 — Découverte : La Boîte à Sons (voir @docs/SPEC_PHASE_1_DECOUVERTE.md)

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
