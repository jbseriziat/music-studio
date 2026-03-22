# Phase 0 — Prompts d'initialisation pour Claude Code

Ce fichier contient les prompts à donner à Claude Code, dans l'ordre.
Copie-colle chaque prompt un par un. Attends que chaque étape compile avant de passer à la suivante.

---

## Prompt 0.1 — Création du projet Tauri v2

```
Initialise un projet Tauri v2 dans le dossier courant (music-studio).

Frontend : React 18 + TypeScript + Vite
Backend : Rust

Le projet doit s'appeler "Music Studio".

Dans le package.json, ajoute ces dépendances :
- zustand (state management)
- @radix-ui/react-dialog, @radix-ui/react-popover, @radix-ui/react-dropdown-menu (composants UI)

Dans le Cargo.toml (src-tauri), ajoute ces dépendances :
- cpal = "0.15" (accès audio bas niveau)
- ringbuf = "0.4" (canal lock-free pour le thread audio)
- hound = "3.5" (lecture/écriture WAV)
- serde = { version = "1", features = ["derive"] }
- serde_json = "1"
- midir = "0.10" (MIDI)

Configure tauri.conf.json avec :
- Titre de fenêtre : "Music Studio"
- Taille par défaut : 1280x800
- Taille minimum : 1024x600
- Redimensionnable : oui

Vérifie que `cargo tauri dev` compile et ouvre une fenêtre avec le contenu React par défaut.
```

---

## Prompt 0.2 — Structure des dossiers

```
Crée la structure de dossiers du projet comme spécifié dans @docs/SPEC_PHASE_0_ARCHITECTURE.md, sections "Architecture Frontend" et "Structure Rust".

Pour le frontend (src/), crée les dossiers avec un fichier index.ts vide dans chacun :
- components/layout/
- components/transport/
- components/timeline/
- components/sound-pad/
- components/drum-rack/
- components/piano-roll/
- components/mixer/
- components/effects/
- components/synth/
- components/sample-browser/
- components/mastering/
- components/shared/
- hooks/
- stores/
- types/
- utils/
- styles/
- styles/themes/

Pour le backend Rust (src-tauri/src/), crée les modules avec un mod.rs vide dans chacun :
- audio/
- sampler/
- synth/
- drums/
- effects/
- midi/
- mixer/
- transport/
- project/
- commands/

Mets à jour lib.rs pour déclarer tous les modules.
Vérifie que le projet compile toujours.
```

---

## Prompt 0.3 — Système de niveaux et types partagés

```
Implémente le système de niveaux (feature levels) tel que décrit dans @docs/SPEC_PHASE_0_ARCHITECTURE.md, section "Système de niveaux".

Crée les fichiers suivants :

1. src/types/levels.ts — Le type FeatureLevel (1 à 5) et le tableau LEVEL_CONFIGS avec les 5 niveaux (Découverte, Petit Producteur, Mélodiste, Studio, Producteur Pro) avec label, description, icon (emoji), et couleur.

2. src/types/profile.ts — L'interface UserProfile avec id, name, avatar (string emoji), level (FeatureLevel), parentCode (optionnel), theme ("light" | "dark" | "colorful"), createdAt.

3. src/types/audio.ts — Les interfaces de base : AudioConfig, SampleInfo, Track, Clip, DrumPattern, MidiNote, MidiClip (voir les specs Phase 0 pour les détails).

4. src/types/project.ts — L'interface Project correspondant au format .msp décrit dans la spec.

5. src/hooks/useFeatureLevel.ts — Le hook qui expose currentLevel, isVisible(level), isEnabled(level) en lisant depuis le settings store.

6. src/components/shared/LevelGate.tsx — Composant wrapper qui affiche ses children uniquement si le niveau courant >= le niveau requis. Props : level (FeatureLevel), children, fallback (optionnel, ce qu'on affiche si le niveau est insuffisant).

7. src/stores/settingsStore.ts — Store Zustand avec :
   - profiles: UserProfile[]
   - activeProfileId: string | null
   - getters : currentLevel, currentTheme, activeProfile
   - actions : createProfile, switchProfile, updateProfile, deleteProfile
   - Persistence dans localStorage pour l'instant (on passera aux fichiers plus tard)

Vérifie que tout compile. Écris un test simple dans App.tsx qui affiche le niveau courant et un LevelGate qui masque un texte au niveau 2+.
```

---

## Prompt 0.4 — Moteur audio minimal (Rust)

```
Implémente le moteur audio minimal en Rust, tel que décrit dans @docs/SPEC_PHASE_0_ARCHITECTURE.md, sections "Architecture Rust — Moteur Audio" et "Communication lock-free".

Crée les fichiers suivants :

1. src-tauri/src/audio/config.rs — La struct AudioConfig avec sample_rate (48000), buffer_size (512), channels (2), bit_depth (32). Implémenter Default.

2. src-tauri/src/audio/commands.rs — L'enum AudioCommand avec les variantes de base : Play, Pause, Stop, SetMasterVolume(f32). On ajoutera les autres variantes au fur et à mesure.

3. src-tauri/src/audio/engine.rs — La struct AudioEngine qui :
   - Détecte le périphérique audio par défaut via cpal
   - Crée un stream de sortie stéréo (48kHz, f32, buffer 512)
   - Démarre un thread audio qui lit les commandes depuis un ringbuf Producer/Consumer
   - Le callback audio pour l'instant génère du silence (remplir le buffer de 0.0)
   - Expose une méthode send_command(&self, cmd: AudioCommand)
   - Affiche dans les logs le nom du périphérique audio détecté

4. src-tauri/src/audio/mod.rs — Exporte les sous-modules.

5. Mets à jour main.rs pour :
   - Créer une instance d'AudioEngine au démarrage de Tauri (dans le setup)
   - Stocker l'AudioEngine dans le state Tauri (State<AudioEngine>)
   - Créer une commande Tauri test : `ping_audio` qui retourne "Audio engine is running" si le moteur est initialisé

Vérifie que `cargo tauri dev` compile, que la fenêtre s'ouvre, et que les logs affichent le périphérique audio détecté. Pas besoin de jouer du son pour l'instant, juste vérifier que cpal s'initialise sans erreur.
```

---

## Prompt 0.5 — Communication IPC aller-retour

```
Mets en place la communication IPC complète entre le frontend React et le backend Rust.

1. Dans src-tauri/src/commands/ crée les fichiers de commandes Tauri :
   - audio_commands.rs — commandes : play, pause, stop, set_master_volume, ping_audio
   - settings_commands.rs — commandes : get_profiles, save_profiles, get_audio_devices
   - project_commands.rs — commandes placeholder : new_project, save_project, load_project

2. Enregistre toutes les commandes dans main.rs avec invoke_handler(tauri::generate_handler![...])

3. Côté frontend, crée src/utils/tauri-commands.ts avec des fonctions TypeScript typées qui wrappent les invoke() :
   - playAudio(), pauseAudio(), stopAudio()
   - setMasterVolume(volume: number)
   - pingAudio(): Promise<string>
   - getAudioDevices(): Promise<AudioDevice[]>
   - etc.

4. Crée src/hooks/useAudioEngine.ts — un hook qui expose les fonctions de contrôle audio et gère l'état (isPlaying, volume...).

5. Teste le tout : dans App.tsx, ajoute un bouton "Test Audio" qui appelle pingAudio() et affiche le résultat. Vérifie que le message fait bien l'aller-retour frontend → Rust → frontend.
```

---

## Prompt 0.6 — Thèmes CSS et layout de base

```
Mets en place les thèmes visuels et le layout de base de l'application.

1. Crée src/styles/global.css avec :
   - Un reset CSS minimal
   - Des variables CSS pour les 3 thèmes : light, dark, colorful
   - Le thème "colorful" (pour les enfants) utilise des couleurs vives, des border-radius de 16px, des polices grandes (16px min)
   - Le thème "dark" est un thème sombre classique pour la production musicale
   - Les variables couvrent : couleurs de fond, texte, accent, surfaces, bordures, ombres, border-radius, tailles de police

2. Crée src/styles/themes/light.css, dark.css, colorful.css si tu préfères les séparer.

3. Crée src/components/layout/AppShell.tsx — le layout principal avec :
   - Un header fixe en haut (futur emplacement du transport)
   - Une sidebar rétractable à gauche (futur sample browser)
   - Une zone principale au centre
   - Le thème CSS appliqué selon le profil actif (via une classe sur le body ou le root)

4. Crée src/components/layout/Header.tsx — barre de header avec :
   - Le nom de l'app "Music Studio" à gauche avec un emoji 🎵
   - Un espace central vide (futur transport)
   - Le profil actif à droite (avatar emoji + nom) — pour l'instant un placeholder

5. Crée src/components/layout/Sidebar.tsx — panneau latéral vide pour l'instant, rétractable avec un bouton toggle.

Applique le thème "colorful" par défaut. Vérifie que l'application s'affiche correctement avec le layout.
```

---

## Validation Phase 0

Avant de passer à la Phase 1, vérifie que :

- [ ] `cargo tauri dev` compile et ouvre la fenêtre
- [ ] La structure de dossiers est complète (front + back)
- [ ] Le moteur audio s'initialise (log du périphérique audio dans la console)
- [ ] L'IPC fonctionne (le bouton "Test Audio" reçoit une réponse du Rust)
- [ ] Le système de niveaux fonctionne (LevelGate masque/affiche selon le niveau)
- [ ] Le store Zustand persiste les profils
- [ ] Le layout de base s'affiche avec le thème colorful
- [ ] Le projet compile sans warnings critiques

Une fois tout ça validé, modifie CLAUDE.md : change "Phase en cours" vers Phase 1.
