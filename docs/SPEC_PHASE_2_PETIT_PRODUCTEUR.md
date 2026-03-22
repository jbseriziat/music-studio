# 🥁 Music Studio — Phase 2 : "Petit Producteur" — Rythmes et Patterns

## Objectif

Ajouter les outils de création rythmique : un **Drum Rack** (grille de pads dédiés aux percussions), un **séquenceur pas-à-pas** (step sequencer) pour programmer des rythmes en cochant des cases, et le contrôle du **tempo (BPM)**. L'enfant peut maintenant créer des boucles rythmiques qui tournent en boucle.

**Niveau requis** : 2 (Petit Producteur)

---

## Fonctionnalités de cette phase

### 2.1 — Drum Rack

**Description** : Un instrument à part entière composé de 8 à 16 pads, chacun associé à un son de percussion. Contrairement aux Sound Pads de la phase 1 (qui sont des "lanceurs de sons" autonomes), le Drum Rack est une **piste instrument** dans la timeline : il peut être séquencé et ses patterns sont enregistrés dans le projet.

**Spécifications** :
- 8 pads visibles par défaut (2 rangées de 4), extensible à 16 au niveau 3+
- Chaque pad affiche : nom du son (ex: "Kick"), mini waveform, couleur
- Chaque pad a un contrôle de volume individuel (petit fader ou knob)
- Clic sur un pad → joue le son immédiatement (comme les sound pads mais dans le contexte du drum rack)
- Clic droit sur un pad → menu : changer le sample, ajuster le pitch (+/- 12 demi-tons), ajuster le volume
- Les pads sont pré-configurés avec un kit de batterie par défaut : Kick, Snare, Closed HH, Open HH, Clap, Tom Low, Tom Mid, Tom High
- Possibilité de charger des "kits" prédéfinis (Hip-Hop, Rock, Electronic, Fun/Kids)
- Le Drum Rack est ajouté comme un type de piste spécial dans la timeline

**Commandes Rust** :
```rust
#[tauri::command]
fn create_drum_rack_track(name: String) -> Result<u32, String>
// → Crée une nouvelle piste de type DrumRack avec le kit par défaut

#[tauri::command]
fn set_drum_pad_sample(track_id: u32, pad_index: u8, sample_path: String) -> Result<(), String>
// → Change le sample d'un pad du drum rack

#[tauri::command]
fn set_drum_pad_volume(track_id: u32, pad_index: u8, volume: f32) -> Result<(), String>

#[tauri::command]
fn set_drum_pad_pitch(track_id: u32, pad_index: u8, pitch_semitones: f32) -> Result<(), String>

#[tauri::command]
fn trigger_drum_pad(track_id: u32, pad_index: u8) -> Result<(), String>
// → Joue le son du pad immédiatement (preview / jeu live)

#[tauri::command]
fn load_drum_kit(track_id: u32, kit_name: String) -> Result<(), String>
// → Charge un kit prédéfini (remplace tous les pads)

#[tauri::command]
fn list_drum_kits() -> Result<Vec<DrumKitInfo>, String>
```

**Composants React** :
- `DrumRack.tsx` — Conteneur principal du drum rack
- `DrumPad.tsx` — Un pad individuel (props: padIndex, sample, volume, pitch, onTrigger)
- `DrumPadSettings.tsx` — Popover/modal pour les réglages d'un pad
- `DrumKitSelector.tsx` — Sélecteur de kit prédéfini

---

### 2.2 — Step Sequencer (Séquenceur pas-à-pas)

**Description** : Grille où chaque ligne correspond à un pad du drum rack et chaque colonne à un "pas" (step) dans le temps. En cochant/décochant les cases, l'enfant programme un pattern rythmique. Le pattern tourne en boucle.

**Concept expliqué simplement** : imagine un tableau. Chaque ligne est un instrument (kick, snare, hihat...). Chaque colonne est un moment dans le temps. Tu cliques sur une case pour dire "joue ce son à ce moment". Quand tu appuies sur Play, la grille se lit de gauche à droite, et recommence.

**Spécifications** :
- Grille de 8 lignes (pads) × 16 colonnes (steps) par défaut
- Nombre de steps configurable : 8, 16, 32 (au niveau 2, fixé à 16)
- Résolution : chaque step = 1 double-croche (1/16 de mesure) → 16 steps = 1 mesure
- Les cases s'activent/désactivent au clic (toggle)
- Case active = couleur du pad, case inactive = gris foncé
- Pendant la lecture, un curseur vertical lumineux se déplace sur la colonne en cours
- Chaque step activé peut avoir une **vélocité** (force du son) : au niveau 2, la vélocité est fixe (100%). Au niveau 3+, on peut ajuster la vélocité par step (clic + drag vertical sur la case)
- Le pattern est associé à un Drum Rack et stocké dans le projet
- Un Drum Rack peut avoir plusieurs patterns (A, B, C...) qu'on peut chaîner dans la timeline
- Au niveau 2, un seul pattern par drum rack. Patterns multiples au niveau 3+

**Interactions audio** :
```typescript
// Structure d'un pattern
interface DrumPattern {
  id: string;
  name: string;
  steps: number;           // 8, 16, ou 32
  resolution: number;      // 1/16 par défaut
  pads: {
    [padIndex: number]: {
      steps: boolean[];       // true/false pour chaque step
      velocities: number[];   // 0-127 pour chaque step (niveau 3+)
    }
  };
}

// Envoyer le pattern au moteur audio
await invoke('set_drum_pattern', {
  trackId: drumRack.trackId,
  pattern: currentPattern
});
```

**Commandes Rust** :
```rust
#[tauri::command]
fn set_drum_pattern(track_id: u32, pattern: DrumPattern) -> Result<(), String>
// → Met à jour le pattern du séquenceur
// → Le moteur audio lira ce pattern en boucle pendant la lecture

#[tauri::command]
fn set_step(track_id: u32, pad_index: u8, step: u8, active: bool) -> Result<(), String>
// → Active/désactive un step individuel (plus léger que d'envoyer tout le pattern)

#[tauri::command]
fn get_current_step() -> Result<u8, String>
// → Retourne le step actuellement joué (pour le curseur visuel)
```

**Implémentation Rust du séquenceur** :
```rust
// drums/sequencer.rs
pub struct StepSequencer {
    pattern: DrumPattern,
    current_step: usize,
    samples_per_step: f64,    // Calculé à partir du BPM et du sample rate
    sample_counter: f64,       // Compteur de samples depuis le dernier step
}

impl StepSequencer {
    pub fn process_tick(&mut self, sample_bank: &SampleBank) -> Vec<(u8, f32)> {
        // Retourne la liste des (pad_index, velocity) à déclencher ce tick
        self.sample_counter += 1.0;
        if self.sample_counter >= self.samples_per_step {
            self.sample_counter -= self.samples_per_step;
            self.current_step = (self.current_step + 1) % self.pattern.steps;

            // Collecter les pads actifs sur ce step
            let mut triggers = Vec::new();
            for (pad_idx, pad_data) in &self.pattern.pads {
                if pad_data.steps[self.current_step] {
                    let velocity = pad_data.velocities[self.current_step] as f32 / 127.0;
                    triggers.push((*pad_idx, velocity));
                }
            }
            return triggers;
        }
        Vec::new()
    }

    pub fn update_bpm(&mut self, bpm: f64, sample_rate: u32) {
        // 1 step = 1 double-croche = 1/4 de beat
        // samples_per_beat = sample_rate * 60 / bpm
        // samples_per_step = samples_per_beat / 4
        self.samples_per_step = (sample_rate as f64 * 60.0) / (bpm * 4.0);
    }
}
```

**Composants React** :
- `StepSequencer.tsx` — Grille complète
- `StepRow.tsx` — Une ligne (un pad) avec ses cases
- `StepCell.tsx` — Une case individuelle (toggle clic, drag pour vélocité au niveau 3+)
- `StepCursor.tsx` — Curseur lumineux de lecture
- `PatternSelector.tsx` — Sélection du pattern A/B/C [Niveau 3+]

**Style** :
- Cases carrées (32x32px minimum), espacement régulier
- Les 4 premiers steps ont un fond légèrement différent (groupement visuel par temps)
- Repères visuels tous les 4 steps (séparateur plus épais)
- Le curseur de lecture est une colonne semi-transparente lumineuse
- Animation douce du curseur (pas saccadé)

---

### 2.3 — Contrôle du Tempo (BPM)

**Description** : Contrôle permettant d'ajuster la vitesse du morceau. Affiché dans la barre de transport.

**Spécifications** :
- Affichage numérique du BPM actuel (ex: "120 BPM")
- Contrôle par : clic + drag vertical, ou boutons +/- par pas de 1 BPM
- Plage : 40 à 240 BPM
- Valeur par défaut : 120 BPM
- Le changement de BPM est en temps réel (pas besoin d'arrêter la lecture)
- Au niveau 2, le BPM s'affiche avec un emoji de vitesse : 🐢 (< 80), 🚶 (80-119), 🏃 (120-159), 🚀 (160+)
- Tap tempo : bouton qu'on peut taper rythmiquement pour détecter le BPM [Niveau 3+]

**Composants React** :
- `BpmControl.tsx` — Affichage + contrôle du BPM (visible à partir du niveau 2)
- `TapTempo.tsx` — Bouton tap tempo [Niveau 3+]

---

### 2.4 — Boucle (Loop)

**Description** : Possibilité de définir une zone de boucle sur la timeline. La lecture revient au début de la boucle quand elle atteint la fin.

**Spécifications** :
- Marqueurs de début/fin de boucle sur la règle temporelle
- Drag pour ajuster les limites de la boucle
- Bouton toggle "Loop" dans la barre de transport
- Quand la boucle est active, la zone est surlignée sur la timeline
- Par défaut, la boucle couvre tout le pattern visible (1 mesure pour le step sequencer)

**Commandes Rust** :
```rust
#[tauri::command]
fn set_loop(enabled: bool, start: f64, end: f64) -> Result<(), String>
```

---

### 2.5 — Améliorations de la Timeline (niveau 2)

**Nouveaux éléments visibles sur la timeline au niveau 2** :
- La règle passe des secondes aux **mesures et temps** (1.1, 1.2, 1.3, 1.4, 2.1...)
- Snap-to-grid s'aligne sur les temps (pas juste les secondes)
- Les pistes de type "Drum Rack" affichent un résumé visuel du pattern (mini step sequencer en lecture seule dans le clip)
- Bouton Mute/Solo par piste (icônes simples)
- La timeline supporte maintenant le **zoom horizontal** (molette + Ctrl ou pinch)

**Composants React mis à jour** :
- `TimeRuler.tsx` — Affichage conditionnel secondes/mesures selon le niveau
- `Track.tsx` — Ajout des boutons Mute (🔇) et Solo (🎧)
- `DrumClip.tsx` — Variante de Clip.tsx pour les patterns de drum

---

### 2.6 — Métronome

**Description** : Clic sonore qui bat le tempo pour aider à rester en rythme.

**Spécifications** :
- Toggle dans la barre de transport (icône métronome)
- Son de clic discret (son grave sur le premier temps, aigu sur les autres)
- Volume du métronome réglable séparément du volume master
- Le métronome ne s'enregistre jamais dans l'export final

**Implémentation Rust** :
```rust
// transport/metronome.rs
pub struct Metronome {
    enabled: bool,
    volume: f32,
    accent_sample: Vec<f32>,   // Son du premier temps (accent)
    click_sample: Vec<f32>,    // Son des autres temps
    beats_per_bar: u8,         // 4 par défaut
}
```

---

## Mises à jour du moteur audio Rust

### Nouveau : système de pistes instrumentales

Au niveau 1, les pistes ne contenaient que des clips audio (samples). Au niveau 2, on introduit les **pistes instrumentales** qui contiennent un instrument (ici le Drum Rack) et des patterns.

```rust
// audio/track.rs
pub enum TrackType {
    Audio,       // Piste audio classique (clips de samples)
    DrumRack,    // Piste drum rack (patterns séquencés)
    // Instrument sera ajouté en phase 3 (synthé)
}

pub struct Track {
    pub id: u32,
    pub name: String,
    pub track_type: TrackType,
    pub volume: f32,
    pub pan: f32,
    pub muted: bool,
    pub solo: bool,

    // Pour les pistes Audio
    pub clips: Vec<AudioClip>,

    // Pour les pistes DrumRack
    pub drum_rack: Option<DrumRack>,
    pub patterns: Vec<DrumPattern>,
    pub active_pattern_id: Option<String>,
}
```

### Mise à jour du callback audio

```rust
// Dans audio_callback, ajouter le traitement des drum racks :
for track in &mut state.tracks {
    if track.muted { continue; }

    match track.track_type {
        TrackType::Audio => {
            // Lecture des clips (identique à la phase 1)
            if let Some(sample) = track.get_clip_sample_at(state.position, sample_bank) {
                left += sample * track.volume * pan_left(track.pan);
                right += sample * track.volume * pan_right(track.pan);
            }
        },
        TrackType::DrumRack => {
            // Vérifier si le séquenceur doit déclencher des pads
            if let Some(ref mut rack) = track.drum_rack {
                let triggers = rack.sequencer.process_tick(sample_bank);
                for (pad_idx, velocity) in triggers {
                    rack.trigger_pad(pad_idx, velocity, sample_bank);
                }
                // Mixer les voix actives du drum rack
                let (l, r) = rack.get_output();
                left += l * track.volume * pan_left(track.pan);
                right += r * track.volume * pan_right(track.pan);
            }
        },
    }
}

// Gestion Solo : si au moins une piste est en solo, muter toutes les autres
```

---

## Checklist de validation Phase 2

- [ ] Le contrôle BPM est visible et fonctionnel dans la barre de transport
- [ ] Le Drum Rack s'ouvre avec un kit par défaut de 8 sons
- [ ] On peut changer le son de chaque pad via le sample browser
- [ ] Le step sequencer affiche une grille 8×16 fonctionnelle
- [ ] Un clic sur une case l'active/désactive
- [ ] Le curseur de lecture se déplace sur la grille pendant la lecture
- [ ] Les sons se déclenchent aux bons moments selon le pattern programmé
- [ ] Le BPM modifie correctement la vitesse de lecture du pattern
- [ ] Le mode boucle fonctionne (la lecture recommence au début)
- [ ] Le métronome bat le tempo correctement
- [ ] Les pistes ont des boutons Mute/Solo fonctionnels
- [ ] La timeline affiche maintenant des mesures/temps au lieu de secondes
- [ ] On peut zoomer sur la timeline
- [ ] Les drum patterns sont sauvegardés avec le projet
- [ ] Les kits prédéfinis se chargent correctement
