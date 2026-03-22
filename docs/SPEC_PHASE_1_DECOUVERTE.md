# 🎒 Music Studio — Phase 1 : "Découverte" — La Boîte à Sons

## Objectif

Créer l'interface de base de l'application avec les fonctionnalités adaptées à un enfant de 4 ans : des **pads sonores colorés** qu'on touche pour jouer des sons, une **timeline simplifiée** où déposer des sons par drag & drop, et les contrôles **Play/Stop** pour écouter sa création.

**Niveau requis** : 1 (Découverte)

---

## Fonctionnalités de cette phase

### 1.1 — Système de profils et niveaux

**Description** : Au lancement, l'application affiche un écran de sélection de profil. Chaque profil a un nom, un avatar (emoji), et un niveau associé.

**Spécifications** :
- Écran de sélection des profils au démarrage avec avatars grands et colorés
- Bouton "+" pour créer un nouveau profil
- Création de profil : champ nom, sélection d'avatar (grille d'emojis), sélection du niveau (1 à 5 avec description visuelle)
- Les profils de niveau 4-5 sont protégés par un code simple (ex : "Combien font 3+4 ?", question aléatoire)
- Les profils sont stockés localement dans un fichier JSON dans le dossier utilisateur
- Le profil actif est affiché dans le header de l'application avec possibilité de changer

**Composants React** :
- `ProfileSelector.tsx` — Écran de sélection (grille de cartes profils)
- `ProfileCreator.tsx` — Modal de création
- `ProfileSwitcher.tsx` — Menu dans le header pour changer de profil
- `LevelGate.tsx` — Composant wrapper : `<LevelGate level={2}><DrumRack /></LevelGate>` → n'affiche rien si le niveau courant est < 2

**Store Zustand** :
```typescript
interface SettingsStore {
  profiles: UserProfile[];
  activeProfileId: string | null;
  // Computed
  currentLevel: FeatureLevel;
  currentTheme: string;
  // Actions
  createProfile: (profile: Omit<UserProfile, 'id' | 'createdAt'>) => void;
  switchProfile: (id: string) => void;
  updateProfile: (id: string, updates: Partial<UserProfile>) => void;
  deleteProfile: (id: string) => void;
}
```

---

### 1.2 — Grille de Sound Pads

**Description** : Une grille de 4x4 pads (16 pads) colorés. Chaque pad est associé à un son. Quand on clique/touche un pad, le son se joue immédiatement. Les pads sont gros, colorés, avec une animation visuelle au déclenchement.

**Spécifications** :
- Grille 4x4 de pads carrés avec coins arrondis
- Chaque pad a une couleur distincte (palette enfantine, vive)
- Animation au clic : le pad "pulse" (scale + changement de luminosité) pendant la durée du son
- Le son commence à jouer instantanément (< 10ms de latence perçue)
- Chaque pad affiche une icône ou un emoji représentant le type de son (🥁 🎸 🐱 🔔 etc.)
- Drag & drop : on peut glisser un pad vers la timeline pour y déposer le son
- Clic droit (ou appui long) : menu pour changer le son du pad via le Sample Browser
- Pads pré-chargés avec des sons variés : drums (kick, snare, hi-hat, clap), instruments (piano, guitare), sons fun (animaux, effets)

**Interactions audio (Tauri Commands)** :
```typescript
// Quand un pad est cliqué :
await invoke('trigger_pad', { padId: pad.id });

// Pour changer le son d'un pad :
await invoke('assign_pad_sample', { padId: pad.id, samplePath: selectedSample.path });
```

**Commandes Rust à implémenter** :
```rust
#[tauri::command]
fn trigger_pad(pad_id: u32, state: State<AudioEngine>) -> Result<(), String>
// → Déclenche la lecture immédiate du sample associé au pad
// → Le sample est déjà chargé en mémoire (pré-chargement au démarrage)
// → Envoie AudioCommand::TriggerPad via le canal lock-free

#[tauri::command]
fn assign_pad_sample(pad_id: u32, sample_path: String, state: State<AudioEngine>) -> Result<(), String>
// → Charge le nouveau sample en mémoire
// → Met à jour le mapping pad → sample
```

**Composants React** :
- `SoundPadGrid.tsx` — Conteneur de la grille, gère le layout responsive
- `SoundPad.tsx` — Un pad individuel (props: id, color, icon, sampleName, onTrigger, onDragStart)

**Style** (thème "colorful" pour les enfants) :
- Pads d'au moins 100x100px, coins arrondis 16px
- Ombre portée douce, effet 3D subtil
- Animation CSS `@keyframes pad-pulse` sur le clic
- Police grande, lisible (sans-serif, bold)
- Les couleurs des pads suivent une palette prédéfinie (pas aléatoire)

---

### 1.3 — Timeline simplifiée

**Description** : Une vue horizontale avec 1 à 4 pistes. On glisse des sons depuis les pads ou le sample browser vers la timeline. Le son apparaît comme un bloc coloré (clip). On peut le déplacer, le supprimer. Le curseur de lecture (playhead) défile de gauche à droite pendant la lecture.

**Spécifications** :
- Vue horizontale scrollable
- Règle temporelle en haut (en secondes au niveau 1, pas en mesures/beats — plus simple pour un enfant)
- 1 à 4 pistes max au niveau 1, chaque piste a une couleur
- Chaque piste a un label éditable et un bouton supprimer
- Les clips sont des rectangles colorés dont la largeur correspond à la durée du son
- Un clip affiche le nom du son et une mini forme d'onde (waveform) à l'intérieur
- Drag & drop pour déplacer un clip sur la timeline
- Snap-to-grid basique (grille de 0.5 secondes au niveau 1)
- Clic sur un clip pour le sélectionner, touche Suppr pour le supprimer
- Le playhead est une ligne verticale rouge qui se déplace pendant la lecture
- Scroll automatique pour suivre le playhead

**Interactions audio** :
```typescript
// Ajouter un clip sur la timeline
await invoke('add_clip', {
  trackId: track.id,
  sampleId: sample.id,
  position: dropPositionInSeconds,
  duration: sample.duration
});

// Déplacer un clip
await invoke('move_clip', {
  clipId: clip.id,
  newPosition: newPositionInSeconds
});

// Supprimer un clip
await invoke('delete_clip', { clipId: clip.id });
```

**Composants React** :
- `Timeline.tsx` — Conteneur principal, gère le scroll et le zoom
- `Track.tsx` — Une piste (drop zone pour les clips)
- `Clip.tsx` — Un clip audio (affiche waveform, draggable)
- `Playhead.tsx` — Ligne de lecture animée
- `TimeRuler.tsx` — Règle temporelle (secondes au niveau 1, mesures aux niveaux supérieurs)
- `AddTrackButton.tsx` — Bouton "+" pour ajouter une piste

**State** :
```typescript
interface TracksStore {
  tracks: Track[];
  clips: Clip[];
  selectedClipId: string | null;
  // Actions
  addTrack: (name: string, color: string) => void;
  removeTrack: (id: string) => void;
  addClip: (trackId: string, sample: SampleInfo, position: number) => void;
  moveClip: (clipId: string, newTrackId: string, newPosition: number) => void;
  deleteClip: (clipId: string) => void;
  selectClip: (clipId: string | null) => void;
}

interface Track {
  id: string;
  name: string;
  color: string;
  volume: number;  // Pas visible au niveau 1, mais existe dans le state
  pan: number;     // Idem
  muted: boolean;
  solo: boolean;
}

interface Clip {
  id: string;
  trackId: string;
  sampleId: string;
  position: number;    // En secondes (niveau 1) ou en beats (niveaux sup.)
  duration: number;
  color: string;
  waveformData: number[];  // Tableau de valeurs pour dessiner la mini waveform
}
```

---

### 1.4 — Transport basique (Play / Stop)

**Description** : Barre de transport avec les contrôles essentiels. Au niveau 1, seuls Play et Stop sont visibles. Le bouton Play est gros et vert, le bouton Stop est gros et rouge.

**Spécifications** :
- Barre fixe en haut ou en bas de l'écran
- Bouton Play (▶) — gros, vert, démarre la lecture depuis la position actuelle
- Bouton Stop (■) — gros, rouge, arrête la lecture et remet la position à 0
- Affichage du temps écoulé (format MM:SS au niveau 1)
- Indicateur visuel de lecture en cours (animation sur le bouton Play ou clignotement)

**Éléments masqués au niveau 1 mais présents dans le code** :
- Bouton Pause (visible à partir du niveau 2)
- Bouton Record (visible à partir du niveau 4)
- Contrôle BPM (visible à partir du niveau 2)
- Contrôle de position (cliquer sur la timeline pour repositionner) — actif dès le niveau 1
- Métronome (visible à partir du niveau 2)
- Compteur en mesures/beats (visible à partir du niveau 2, remplace le compteur en secondes)

**Composants React** :
- `TransportBar.tsx` — Barre complète
- `PlayButton.tsx` — Avec animation
- `StopButton.tsx`
- `TimeDisplay.tsx` — Affichage du temps (format adapté au niveau)
- `BpmControl.tsx` — [Niveau 2+]
- `RecordButton.tsx` — [Niveau 4+]
- `MetronomeToggle.tsx` — [Niveau 2+]

---

### 1.5 — Sample Browser (Navigateur de sons)

**Description** : Panneau latéral permettant de parcourir les sons disponibles. Au niveau 1, les sons sont organisés par catégories visuelles (avec des icônes/emojis). On peut écouter un son en cliquant dessus, et le glisser vers un pad ou la timeline.

**Spécifications** :
- Panneau latéral (gauche) rétractable
- Catégories de sons avec icônes : 🥁 Drums, 🎸 Instruments, 🎵 Mélodies, 🐱 Animaux, 🔔 Effets, ⭐ Favoris
- Chaque son est affiché avec : icône/emoji, nom, durée, bouton play preview
- Clic sur un son → prévisualisation (joue le son sans l'ajouter au projet)
- Drag d'un son → le déposer sur un pad ou sur la timeline
- Les sons sont livrés avec l'application (dossier `samples/` embarqué)
- Au niveau 1, pas de barre de recherche (trop de sons = confusion). Juste les catégories.
- Barre de recherche apparaît au niveau 2+
- Import de sons personnels apparaît au niveau 3+

**Sons embarqués (à fournir avec l'application)** :

Le dossier `samples/` est structuré ainsi :
```
samples/
├── drums/
│   ├── kicks/       (8-10 sons)
│   ├── snares/      (8-10 sons)
│   ├── hihats/      (6-8 sons)
│   ├── claps/       (4-6 sons)
│   ├── toms/        (4-6 sons)
│   └── percussion/  (6-8 sons)
├── instruments/
│   ├── piano/       (8 notes, do à do)
│   ├── guitar/      (6-8 accords)
│   ├── bass/        (6-8 notes)
│   └── strings/     (4-6 sons)
├── melodies/
│   ├── loops/       (8-10 boucles mélodiques)
│   └── oneshots/    (6-8 notes isolées)
├── fun/
│   ├── animals/     (8-10 sons d'animaux)
│   ├── nature/      (6-8 sons de nature)
│   └── effects/     (8-10 bruitages amusants)
└── metadata.json    # Index de tous les samples avec catégorie, tags, durée
```

Tous les sons doivent être en **WAV 48kHz 16-bit** pour la qualité, ou **OGG** pour les boucles (meilleure gestion du looping).

**Commandes Rust** :
```rust
#[tauri::command]
fn list_samples(category: Option<String>) -> Result<Vec<SampleInfo>, String>
// → Lit le metadata.json et retourne la liste filtrée

#[tauri::command]
fn preview_sample(path: String) -> Result<(), String>
// → Joue le son une fois (hors du contexte du projet)
// → S'arrête automatiquement ou si un autre preview est lancé

#[tauri::command]
fn stop_preview() -> Result<(), String>
// → Arrête la prévisualisation en cours
```

```rust
struct SampleInfo {
    id: u32,
    name: String,
    category: String,
    path: String,
    duration_ms: u32,
    waveform: Vec<f32>,  // Données de forme d'onde pré-calculées (128 points)
    tags: Vec<String>,
}
```

---

### 1.6 — Moteur audio de base (Rust)

**Description** : Le moteur audio doit être initialisé au démarrage. Il gère la lecture des samples (pads + timeline), le transport, et le mixage basique des pistes vers la sortie stéréo.

**Spécifications techniques** :

1. **Initialisation** :
   - Détecter le périphérique audio par défaut via `cpal`
   - Configurer un stream de sortie : 48kHz, 2 canaux, buffer 512 frames
   - Démarrer le thread audio haute priorité
   - Pré-charger les samples des 16 pads en mémoire

2. **Lecture des pads** :
   - Quand `trigger_pad` est appelé, envoyer un message au thread audio
   - Le thread audio commence à lire le sample au prochain cycle
   - Polyphonie : si le pad est retriggered avant la fin, les deux lectures coexistent (max 8 voix par pad)

3. **Lecture de la timeline** :
   - Horloge de lecture qui avance en temps réel
   - À chaque cycle audio, vérifier quels clips doivent être joués à la position courante
   - Mixer tous les clips actifs vers la sortie
   - Le mixage au niveau 1 est simple : somme des samples × volume de piste (fixé à 1.0 par défaut)

4. **Preview** :
   - Canal de preview séparé (ne passe pas par le mixer)
   - Un seul preview à la fois

**Architecture Rust simplifiée pour cette phase** :

```rust
// audio/engine.rs
pub struct AudioEngine {
    // Canal de commandes lock-free (main thread → audio thread)
    command_sender: Producer<AudioCommand>,

    // État partagé (read-only depuis l'audio thread)
    sample_bank: Arc<SampleBank>,

    // Configuration
    config: AudioConfig,
}

impl AudioEngine {
    pub fn new() -> Result<Self, AudioError> { /* init cpal + thread */ }
    pub fn send_command(&self, cmd: AudioCommand) { /* envoie via ringbuf */ }
}

// Fonction appelée par cpal à chaque cycle audio
fn audio_callback(
    data: &mut [f32],
    command_receiver: &mut Consumer<AudioCommand>,
    state: &mut AudioState,
    sample_bank: &SampleBank,
) {
    // 1. Traiter les commandes en attente
    while let Some(cmd) = command_receiver.pop() {
        state.handle_command(cmd);
    }

    // 2. Si en lecture, avancer la position
    if state.is_playing {
        // Pour chaque frame du buffer...
        for frame in data.chunks_mut(2) {
            let mut left = 0.0f32;
            let mut right = 0.0f32;

            // Mixer les pads actifs
            for voice in &mut state.pad_voices {
                if voice.is_active() {
                    let sample = voice.next_sample(sample_bank);
                    left += sample;
                    right += sample;
                }
            }

            // Mixer les clips de la timeline
            for track in &mut state.tracks {
                if let Some(sample) = track.get_sample_at(state.position, sample_bank) {
                    left += sample * track.volume;
                    right += sample * track.volume;
                }
            }

            // Clamp pour éviter la saturation
            frame[0] = left.clamp(-1.0, 1.0) * state.master_volume;
            frame[1] = right.clamp(-1.0, 1.0) * state.master_volume;

            state.position += 1.0 / state.sample_rate as f64;
        }
    }
}
```

---

### 1.7 — Sauvegarde / Chargement de projet

**Description** : Même au niveau 1, l'enfant (ou le parent) doit pouvoir sauvegarder et recharger un projet.

**Spécifications** :
- Bouton "Sauvegarder" (💾 icône disquette ou étoile) dans le header
- Sauvegarde automatique toutes les 2 minutes
- Le projet est sauvegardé comme un fichier `.msp` (JSON) dans un dossier dédié : `~/MusicStudio/Projects/`
- Les samples utilisés sont référencés par chemin relatif (pas copiés)
- Au chargement, si un sample est manquant, afficher un avertissement clair
- Le format du fichier projet doit inclure le champ `level_created_at` pour savoir à quel niveau le projet a été créé

**Interface** :
- Menu Fichier → Nouveau / Ouvrir / Sauvegarder / Sauvegarder sous
- Écran d'accueil avec la liste des projets récents (après sélection du profil)
- Au niveau 1, l'écran d'accueil est simple : une grille de "cartes projet" avec le nom et la date

---

## Design et UX — Thème enfant (niveau 1)

### Principes visuels
- Coins très arrondis (border-radius: 16px minimum)
- Couleurs vives mais pas agressives (palette Material Design 400)
- Polices grandes et grasses (minimum 16px, titres 24px+)
- Icônes/emojis plutôt que du texte quand c'est possible
- Animations douces pour chaque interaction (feedback immédiat)
- Aucun texte technique visible (pas de "48kHz", pas de "dB", pas de "buffer")
- Le curseur de la souris change d'apparence sur les zones interactives

### Layout niveau 1
```
┌──────────────────────────────────────────────┐
│  [👤 Profil]      ▶ PLAY  ■ STOP    00:12   │  ← Header / Transport
├──────────┬───────────────────────────────────┤
│          │                                    │
│  Sample  │        Sound Pad Grid             │
│ Browser  │         (4x4 pads)                │
│          │                                    │
│  🥁 Drums│    [🔴] [🟠] [🟡] [🟢]          │
│  🎸 Instr│    [🔵] [🟣] [🟤] [⚪]          │
│  🐱 Fun  │    [🔴] [🟠] [🟡] [🟢]          │
│  ⭐ Favs │    [🔵] [🟣] [🟤] [⚪]          │
│          │                                    │
│          ├───────────────────────────────────┤
│          │         Timeline                   │
│          │  Piste 1: [====clip====]           │
│          │  Piste 2:      [===clip===]        │
│          │              ▼ playhead             │
└──────────┴───────────────────────────────────┘
```

---

## Checklist de validation Phase 1

Avant de passer à la phase 2, vérifier que :

- [ ] L'application se lance sur Linux et Windows
- [ ] Les profils se créent, se sélectionnent et persistent entre les redémarrages
- [ ] Le système de niveaux masque correctement les fonctionnalités
- [ ] Les 16 pads jouent des sons immédiatement au clic (latence < 15ms perçue)
- [ ] Le sample browser affiche les sons par catégorie
- [ ] On peut glisser un son d'un pad ou du browser vers la timeline
- [ ] La timeline affiche les clips avec leur waveform
- [ ] On peut déplacer et supprimer des clips
- [ ] Play/Stop fonctionnent et le playhead se déplace
- [ ] Tous les clips se jouent correctement pendant la lecture
- [ ] La sauvegarde et le chargement de projet fonctionnent
- [ ] Le thème enfant est appliqué (couleurs, arrondis, taille des éléments)
- [ ] Aucun crash audio (pas de craquement, pas de silence inattendu)
