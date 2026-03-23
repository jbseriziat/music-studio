# Phase 1 — Prompts "Découverte"

Avant de commencer : mets à jour la section "Phase en cours" de CLAUDE.md :
```
## Phase en cours
Phase 1 — Découverte (voir @docs/SPEC_PHASE_1_DECOUVERTE.md)
```

---

## Prompt 1.1 — Écran de sélection de profil

```
Implémente l'écran de sélection de profil tel que décrit dans @docs/SPEC_PHASE_1_DECOUVERTE.md section 1.1.

Crée les composants suivants :

1. src/components/layout/ProfileSelector.tsx — Écran plein qui s'affiche au démarrage si aucun profil n'est actif. Il affiche :
   - Un titre "Qui joue aujourd'hui ?" avec l'emoji 🎵
   - Une grille de cartes profils (chaque carte = avatar emoji + nom + badge du niveau)
   - Un bouton "+" pour créer un nouveau profil
   - Les cartes sont grandes (180x200px minimum), colorées, avec des coins très arrondis (thème enfant)

2. src/components/layout/ProfileCreator.tsx — Modal (Radix Dialog) de création de profil :
   - Champ texte pour le nom
   - Grille de sélection d'avatar (16 emojis au choix : 🦁🐱🐶🐸🦊🐼🐨🦄🐙🦋🐢🐬🦜🐝🐞🎵)
   - Sélecteur de niveau (1 à 5) avec pour chaque niveau : l'emoji, le label, et la description courte tirés de LEVEL_CONFIGS
   - Pour les niveaux 4 et 5 : un champ "Code parent" apparaît (texte libre, 4 caractères minimum)
   - Sélecteur de thème : "Coloré 🌈" / "Sombre 🌙" / "Clair ☀️"
   - Bouton "C'est parti !" pour valider

3. src/components/layout/ProfileSwitcher.tsx — Petit menu dans le Header :
   - Affiche l'avatar et le nom du profil actif
   - Au clic, affiche un dropdown (Radix DropdownMenu) avec la liste des profils
   - Pour accéder aux profils niveau 4-5, demander le code parent via un petit prompt
   - Option "Gérer les profils" qui ramène à l'écran ProfileSelector

4. Mets à jour AppShell.tsx pour :
   - Afficher ProfileSelector si aucun profil actif
   - Afficher l'app normale si un profil est actif
   - Intégrer ProfileSwitcher dans le Header

5. Mets à jour settingsStore.ts pour persister les profils. Pour l'instant utilise localStorage, on migrera vers les fichiers Tauri plus tard.

Applique le thème "colorful" par défaut. Tout doit être gros, coloré, avec des animations douces au survol et au clic.
```

---

## Prompt 1.2 — Moteur audio : lecture de samples

```
Étends le moteur audio Rust pour supporter le chargement et la lecture de samples.

Lis les specs dans @docs/SPEC_PHASE_1_DECOUVERTE.md section 1.6 et @docs/SPEC_PHASE_0_ARCHITECTURE.md section "AudioGraph".

1. src-tauri/src/sampler/sample_bank.rs — Crée la struct SampleBank :
   - Stocke les samples chargés en mémoire (HashMap<u32, Vec<f32>>)
   - Méthode load_sample(path: &str) -> Result<u32, Error> : lit un fichier WAV avec hound, le convertit en f32 mono ou stéréo, le stocke, retourne un ID
   - Méthode get_sample(id: u32) -> Option<&[f32]>
   - Pré-calcule les données de waveform (128 points pour l'affichage)

2. src-tauri/src/audio/commands.rs — Ajoute les variantes à AudioCommand :
   - TriggerPad { pad_id: u32 }
   - SetMasterVolume(f32)

3. Crée un système de "voix" (voices) pour les pads :
   - Struct PadVoice : sample_id, position de lecture, active/inactive, volume
   - Maximum 32 voix simultanées
   - Quand TriggerPad arrive, trouver une voix libre et démarrer la lecture du sample

4. Mets à jour le callback audio dans engine.rs :
   - Traiter les commandes en attente du ringbuf
   - Pour chaque voix active, lire le sample et avancer la position
   - Mixer toutes les voix vers la sortie stéréo (somme + clamp -1.0 à 1.0)
   - Appliquer le master volume

5. Crée les commandes Tauri dans commands/audio_commands.rs :
   - load_sample(path: String) -> Result<SampleInfo, String>
   - trigger_pad(pad_id: u32) -> Result<(), String>
   - set_master_volume(volume: f32) -> Result<(), String>

6. La struct SampleInfo retournée au frontend doit contenir : id, name, duration_ms, waveform (Vec<f32> de 128 points).

Teste en créant un fichier WAV de test (ou génère un bip de 0.5 seconde en code). Vérifie que trigger_pad produit du son dans les enceintes.
```

---

## Prompt 1.3 — Grille de Sound Pads

```
Implémente la grille de Sound Pads telle que décrite dans @docs/SPEC_PHASE_1_DECOUVERTE.md section 1.2.

1. src/components/sound-pad/SoundPadGrid.tsx — Grille 4x4 de pads :
   - Layout CSS Grid, responsive, qui s'adapte à l'espace disponible
   - 16 pads avec des couleurs distinctes de la palette suivante (en ordre) :
     #F44336, #FF9800, #FFEB3B, #4CAF50, #2196F3, #9C27B0, #795548, #FFFFFF,
     #E91E63, #FF5722, #CDDC39, #009688, #3F51B5, #673AB7, #607D8B, #FFC107
   - Chaque pad a un emoji et un nom par défaut (à configurer avec les sons chargés)

2. src/components/sound-pad/SoundPad.tsx — Un pad individuel :
   - Props : id, color, icon (emoji), sampleName, sampleId
   - Au clic : appelle trigger_pad via le hook useAudioEngine, et joue une animation CSS "pulse" (scale 0.95 → 1.05 → 1.0 sur 150ms)
   - L'emoji est affiché en gros au centre (32px), le nom du son en petit en bas (12px)
   - Curseur pointer au survol, léger assombrissement
   - Le pad est draggable (HTML5 drag, dataTransfer contient le sampleId)
   - Au clic droit : pour l'instant juste un console.log("menu contextuel pad"), on ajoutera le menu plus tard

3. Crée un store src/stores/padsStore.ts :
   - État : tableau de 16 pads, chacun avec { id, sampleId, sampleName, color, icon }
   - Actions : assignPadSample(padId, sampleId, sampleName), triggerPad(padId)
   - Pads pré-configurés avec les 16 couleurs et des noms par défaut

4. Intègre la grille dans le layout principal (zone centrale de AppShell).

Pour l'instant les pads n'ont pas de vrais sons associés (on les connectera avec le sample browser au prompt 1.5). L'important est que le clic déclenche l'appel IPC trigger_pad et que l'animation fonctionne.
```

---

## Prompt 1.4 — Transport (Play / Stop)

```
Implémente la barre de transport basique telle que décrite dans @docs/SPEC_PHASE_1_DECOUVERTE.md section 1.4.

1. Côté Rust, implémente le transport dans src-tauri/src/transport/transport.rs :
   - Struct Transport : is_playing (bool), position (f64 en secondes), sample_rate (u32)
   - Méthodes : play(), pause(), stop() (remet position à 0), advance(num_samples) (avance la position)
   - Intègre le Transport dans l'AudioEngine : le callback audio avance la position quand is_playing est true

2. Ajoute les commandes Tauri :
   - play() -> Result<(), String> : envoie AudioCommand::Play
   - stop() -> Result<(), String> : envoie AudioCommand::Stop
   - get_position() -> Result<f64, String> : retourne la position actuelle en secondes

3. Côté frontend, crée src/stores/transportStore.ts :
   - État : isPlaying, position (number, en secondes)
   - Actions : play(), stop()
   - Un polling toutes les 50ms quand isPlaying est true pour mettre à jour la position depuis le Rust (via get_position)

4. Crée src/components/transport/TransportBar.tsx :
   - Barre fixe intégrée dans le Header
   - Bouton Play ▶ : gros (48x48px minimum), fond vert #4CAF50, icône blanche
     - Quand la lecture est en cours, le bouton a un contour lumineux animé (pulsation douce)
   - Bouton Stop ■ : gros (48x48px), fond rouge #F44336, icône blanche
   - Affichage du temps : format MM:SS (ex: "01:23") au niveau 1
   - Les éléments suivants existent dans le code mais sont masqués par LevelGate :
     - BpmControl (niveau 2+)
     - Bouton Record (niveau 4+)
     - Bouton Pause (niveau 2+)
     - MetronomeToggle (niveau 2+)

5. Intègre TransportBar dans le Header, centré entre le logo et le profil switcher.

Teste : le bouton Play doit faire avancer la position (visible dans le compteur de temps), Stop la remet à 0.
```

---

## Prompt 1.5 — Sample Browser

```
Implémente le navigateur de sons tel que décrit dans @docs/SPEC_PHASE_1_DECOUVERTE.md section 1.5.

1. Côté Rust :
   - Crée un dossier samples/ à la racine du projet avec quelques sous-dossiers : drums/kicks/, drums/snares/, drums/hihats/, fun/effects/
   - Génère programmatiquement 4-6 fichiers WAV de test (sons synthétiques simples) : un kick (sinus 60Hz avec decay), une snare (bruit blanc court), un hihat (bruit blanc très court), un clap, et 2-3 sons "fun" (bip, boop, slide). Chaque son en WAV 48kHz 16-bit, durée 0.1 à 0.5 seconde.
   - Crée un fichier samples/metadata.json qui indexe tous les samples avec : id, name, category, path relatif, tags
   - Implémente les commandes Tauri :
     - list_samples(category: Option<String>) -> Result<Vec<SampleInfo>, String> : lit metadata.json et retourne la liste
     - preview_sample(path: String) -> Result<(), String> : joue le sample une fois (canal de preview séparé, hors du mixer)
     - stop_preview() -> Result<(), String>

2. Côté frontend, crée :
   - src/components/sample-browser/SampleBrowser.tsx : panneau dans la Sidebar gauche
     - Liste de catégories en haut avec emojis : 🥁 Drums, 🎸 Instruments, 🎵 Mélodies, 🐱 Fun, ⭐ Favoris
     - Au clic sur une catégorie, affiche les sons de cette catégorie
     - Pas de barre de recherche au niveau 1 (masquée par LevelGate niveau 2+)
   - src/components/sample-browser/SampleList.tsx : liste des sons d'une catégorie
     - Chaque son affiche : emoji, nom, durée (ex: "0.3s"), bouton play preview ▶
   - src/components/sample-browser/SamplePreview.tsx : bouton play qui appelle preview_sample

3. Le drag & drop depuis le sample browser :
   - Chaque élément de SampleList est draggable
   - Le dataTransfer contient le sampleId et le samplePath
   - On pourra le déposer sur un Sound Pad ou sur la Timeline (qui sera implémentée au prompt suivant)

4. Connecte les Sound Pads : au chargement de l'app, assigne les premiers samples disponibles aux 16 pads. Quand on clique sur un pad, il joue le bon son.

Teste : la sidebar affiche les catégories, on voit les sons, on peut les prévisualiser, et les pads jouent leurs sons respectifs.
```

---

## Prompt 1.6 — Timeline simplifiée

```
Implémente la timeline simplifiée telle que décrite dans @docs/SPEC_PHASE_1_DECOUVERTE.md section 1.3.

1. Côté Rust, étends le moteur audio pour gérer les clips sur la timeline :
   - Crée src-tauri/src/sampler/clip.rs : struct AudioClip { id: u32, track_id: u32, sample_id: u32, position: f64 (secondes), duration: f64 }
   - Mets à jour le callback audio : quand is_playing, pour chaque piste, vérifier quels clips doivent être joués à la position courante, et mixer leur audio
   - Commandes Tauri :
     - add_track(name: String, color: String) -> Result<u32, String>
     - remove_track(track_id: u32) -> Result<(), String>
     - add_clip(track_id: u32, sample_id: u32, position: f64) -> Result<u32, String>
     - move_clip(clip_id: u32, new_position: f64) -> Result<(), String>
     - delete_clip(clip_id: u32) -> Result<(), String>

2. Crée le store src/stores/tracksStore.ts :
   - État : tracks (Track[]), clips (Clip[]), selectedClipId
   - Actions : addTrack, removeTrack, addClip, moveClip, deleteClip, selectClip
   - Synchronise avec le backend Rust à chaque modification

3. Crée les composants :
   - src/components/timeline/Timeline.tsx : conteneur principal
     - Scroll horizontal, occupe la partie basse de la zone principale
     - Drop zone : on peut déposer un sample depuis le SampleBrowser ou un SoundPad
     - Au drop : crée un clip à la position correspondante
   - src/components/timeline/TimeRuler.tsx : règle en haut
     - Au niveau 1 : affiche les secondes (0s, 1s, 2s, 3s...)
     - Graduation tous les 0.5 secondes (traits fins) et toutes les secondes (traits épais + label)
   - src/components/timeline/Track.tsx : une piste horizontale
     - Header à gauche : nom de la piste (éditable au clic), couleur, bouton supprimer (🗑️)
     - Zone de contenu : affiche les clips, est une drop zone
   - src/components/timeline/Clip.tsx : un clip sur la piste
     - Rectangle coloré (couleur de la piste), largeur proportionnelle à la durée
     - Affiche le nom du sample et une mini waveform à l'intérieur (utilise les données waveform du SampleInfo)
     - Draggable horizontalement (snap sur grille de 0.5 secondes)
     - Sélectionnable au clic (contour lumineux), supprimable avec la touche Delete
   - src/components/timeline/Playhead.tsx : ligne verticale rouge
     - Position synchronisée avec transportStore.position
     - Se déplace fluidement de gauche à droite pendant la lecture
     - Le scroll de la timeline suit le playhead automatiquement
   - src/components/timeline/AddTrackButton.tsx : bouton "+" sous la dernière piste

4. Layout : la grille de SoundPads occupe la moitié haute de la zone principale, la Timeline la moitié basse. Un séparateur draggable entre les deux permettrait de redimensionner (optionnel).

Limite à 4 pistes maximum au niveau 1 (LevelGate sur le bouton AddTrack si >= 4 pistes).

Teste : glisse un son depuis le sample browser vers la timeline, appuie sur Play, le playhead avance et le son se joue au bon moment.
```

---

## Prompt 1.7 — Sauvegarde / Chargement de projet

```
Implémente la sauvegarde et le chargement de projets tel que décrit dans @docs/SPEC_PHASE_1_DECOUVERTE.md section 1.7.

1. Côté Rust :
   - Crée src-tauri/src/project/project.rs : la struct Project (sérialisable avec serde) correspondant au format .msp décrit dans @docs/SPEC_PHASE_0_ARCHITECTURE.md section "Format de projet"
   - Crée src-tauri/src/project/file_io.rs :
     - save_project(project: &Project, path: &str) -> Result<(), Error> : sérialise en JSON et écrit le fichier .msp
     - load_project(path: &str) -> Result<Project, Error> : lit le fichier et désérialise
     - get_projects_dir() -> PathBuf : retourne ~/MusicStudio/Projects/ (le crée s'il n'existe pas)
     - list_projects() -> Result<Vec<ProjectSummary>, Error> : liste les fichiers .msp du dossier avec nom et date de modification
   - Commandes Tauri :
     - new_project(name: String) -> Result<(), String> : réinitialise l'état
     - save_project(path: Option<String>) -> Result<String, String> : sauvegarde, retourne le chemin
     - load_project(path: String) -> Result<ProjectInfo, String> : charge et retourne les infos
     - list_projects() -> Result<Vec<ProjectSummary>, String>

2. Crée le store src/stores/projectStore.ts :
   - État : projectName, projectPath (ou null si jamais sauvegardé), isDirty (modifications non sauvegardées), lastSavedAt
   - Actions : newProject, saveProject, loadProject, markDirty, markClean
   - Auto-save toutes les 2 minutes si isDirty est true

3. Crée les composants :
   - src/components/layout/ProjectMenu.tsx : menu Fichier dans le header (ou boutons) :
     - 📄 Nouveau (avec confirmation si isDirty)
     - 📂 Ouvrir (liste les projets existants)
     - 💾 Sauvegarder (raccourci Ctrl+S)
     - 💾 Sauvegarder sous...
   - src/components/layout/ProjectBrowser.tsx : modal qui affiche la liste des projets sauvegardés
     - Chaque projet : nom, date, bouton ouvrir, bouton supprimer
     - Affiché comme grille de cartes (style enfant au niveau 1)
   - L'écran d'accueil (après sélection du profil) affiche ProjectBrowser avec le bouton "Nouveau projet"

4. Implémente Ctrl+S pour sauvegarder rapidement.

5. Quand on charge un projet : restaurer toutes les pistes, clips et pads dans les stores correspondants, et reconstruire l'état du moteur audio Rust.

Teste : crée un projet avec quelques clips, sauvegarde, ferme l'app, réouvre, charge le projet → tout doit être restauré.
```

---

## Prompt 1.8 — Polish et intégration finale Phase 1

```
Fais un pass de finition sur la Phase 1 pour que tout soit bien intégré.

1. Vérifie et corrige les interactions entre tous les composants :
   - Le drag & drop du sample browser vers les pads ET vers la timeline
   - Le drag & drop des pads vers la timeline
   - Le clic droit sur un pad ouvre un menu (Radix DropdownMenu) avec "Changer le son" qui ouvre le sample browser filtré
   - La sélection d'un clip avec clic, et suppression avec Delete

2. Gestion du clavier :
   - Espace : toggle Play/Stop
   - Delete/Backspace : supprimer le clip sélectionné
   - Ctrl+S : sauvegarder
   - Ctrl+Z : undo (juste le store, pas besoin d'historique complet pour l'instant)

3. Retours visuels :
   - Quand on drag un sample, la zone de drop (pad ou timeline) se met en surbrillance
   - Quand un pad joue, son animation est bien visible
   - Le playhead est bien fluide et visible
   - Les clips affichent bien leur mini waveform

4. Thème colorful : vérifie que tous les éléments sont bien stylés pour un enfant de 4 ans :
   - Taille des éléments suffisante (pas de petits boutons)
   - Contrastes suffisants
   - Pas de texte technique visible (pas de "48kHz", pas de "dB")
   - Emojis partout où c'est possible

5. Performances : vérifie qu'il n'y a pas de craquements audio, que le playhead est fluide, et que le drag & drop ne lag pas.

6. Corrige tous les warnings de compilation (Rust et TypeScript).
```

---

## Validation Phase 1

- [ ] Les profils se créent et persistent entre les sessions
- [ ] Le système de niveaux masque les fonctionnalités correctement
- [ ] Les 16 pads jouent des sons au clic (latence < 15ms perçue)
- [ ] Le sample browser affiche les sons par catégorie
- [ ] On peut prévisualiser un son dans le browser
- [ ] Le drag & drop fonctionne : browser → pad, browser → timeline, pad → timeline
- [ ] La timeline affiche les clips avec mini waveform
- [ ] On peut déplacer et supprimer des clips
- [ ] Play/Stop fonctionnent, le playhead se déplace
- [ ] Les clips se jouent au bon moment pendant la lecture
- [ ] La sauvegarde et le chargement de projet fonctionnent
- [ ] Le thème enfant est bien appliqué
- [ ] Aucun crash audio
