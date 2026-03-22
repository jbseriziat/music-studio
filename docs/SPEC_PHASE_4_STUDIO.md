# 🎛️ Music Studio — Phase 4 : "Studio" — Mixage, Effets et Enregistrement

## Objectif

Transformer l'application en un véritable studio : un **mixer multi-pistes** avec console de mixage visuelle, une **chaîne d'effets** par piste (réverbe, delay, EQ, compresseur), l'**enregistrement audio** depuis un micro, et l'**import/export** de fichiers audio.

**Niveau requis** : 4 (Studio)

---

## Fonctionnalités de cette phase

### 4.1 — Mixer (Console de mixage)

**Description** : Vue console classique inspirée des tables de mixage. Chaque piste est représentée par une "tranche" (channel strip) verticale avec fader de volume, knob de panoramique, boutons mute/solo, et VU-mètre.

**Spécifications** :
- Vue dédiée accessible via un onglet/bouton dans l'interface principale (toggle Timeline ↔ Mixer, ou les deux visibles en split)
- Une tranche par piste + une tranche Master à droite
- Chaque tranche (ChannelStrip) contient de haut en bas :
  1. Nom de la piste (éditable)
  2. Indicateur du type (Audio 🎵 / Drums 🥁 / Instrument 🎹)
  3. Slots d'effets (inserts) — voir 4.2
  4. Knob panoramique (gauche ↔ droite)
  5. Boutons Solo (S) et Mute (M)
  6. Fader de volume (vertical, draggable) avec échelle en dB
  7. VU-mètre stéréo (barres LED vertes/jaunes/rouges)
  8. Valeur numérique du volume en dB
- La tranche Master est identique mais sans panoramique et avec un VU-mètre plus grand
- Les faders vont de -∞ (silence) à +6 dB, position nominale à 0 dB
- Double-clic sur un fader → remet à 0 dB

**Conversion dB ↔ linéaire** :
```
volume_linear = 10^(volume_dB / 20)
volume_dB = 20 × log10(volume_linear)
```

**VU-mètre** :
- Mise à jour à 30 fps minimum (smooth, pas saccadé)
- Couleurs : vert (< -12 dB), jaune (-12 à -3 dB), rouge (> -3 dB)
- Peak hold : un indicateur reste au niveau max pendant 1.5 secondes avant de redescendre
- Le moteur audio envoie les niveaux (peak + RMS) au frontend via des événements Tauri

**Commandes Rust** :
```rust
#[tauri::command]
fn set_track_volume_db(track_id: u32, volume_db: f32) -> Result<(), String>

#[tauri::command]
fn set_track_pan(track_id: u32, pan: f32) -> Result<(), String>
// pan: -1.0 (gauche) à 1.0 (droite), 0.0 = centre

#[tauri::command]
fn set_track_mute(track_id: u32, muted: bool) -> Result<(), String>

#[tauri::command]
fn set_track_solo(track_id: u32, solo: bool) -> Result<(), String>

#[tauri::command]
fn set_master_volume_db(volume_db: f32) -> Result<(), String>

// Événement envoyé périodiquement du Rust vers le React :
// "audio://meter-update" → { track_id, peak_l, peak_r, rms_l, rms_r }
```

**Implémentation Rust du metering** :
```rust
// mixer/metering.rs
pub struct Meter {
    peak_l: f32,
    peak_r: f32,
    rms_sum_l: f64,
    rms_sum_r: f64,
    rms_count: u32,
    peak_hold_l: f32,
    peak_hold_r: f32,
    peak_hold_countdown: u32,
}

impl Meter {
    pub fn process_sample(&mut self, left: f32, right: f32) {
        // Peak
        self.peak_l = self.peak_l.max(left.abs());
        self.peak_r = self.peak_r.max(right.abs());
        // RMS
        self.rms_sum_l += (left * left) as f64;
        self.rms_sum_r += (right * right) as f64;
        self.rms_count += 1;
    }

    pub fn get_and_reset(&mut self) -> MeterData {
        let rms_l = (self.rms_sum_l / self.rms_count.max(1) as f64).sqrt() as f32;
        let rms_r = (self.rms_sum_r / self.rms_count.max(1) as f64).sqrt() as f32;
        let data = MeterData {
            peak_l: self.peak_l, peak_r: self.peak_r,
            rms_l, rms_r,
        };
        self.peak_l = 0.0;
        self.peak_r = 0.0;
        self.rms_sum_l = 0.0;
        self.rms_sum_r = 0.0;
        self.rms_count = 0;
        data
    }
}
```

**Composants React** :
- `Mixer.tsx` — Layout horizontal scrollable des tranches
- `ChannelStrip.tsx` — Une tranche de mixage
- `MasterStrip.tsx` — Tranche master (plus large)
- `Fader.tsx` — Composant fader vertical (drag, double-clic reset, affichage dB)
- `Knob.tsx` — Composant potentiomètre rotatif (pour le panoramique et les effets)
- `VuMeter.tsx` — Barre de niveau stéréo avec peak hold
- `MuteButton.tsx` / `SoloButton.tsx`

---

### 4.2 — Chaîne d'effets (Insert Effects)

**Description** : Chaque piste dispose de slots d'effets où on peut insérer des processeurs audio. Les effets sont appliqués en série (le signal passe dans chaque effet l'un après l'autre).

**Effets disponibles au niveau 4** :

#### Réverbération (Reverb)
- Simule l'acoustique d'un espace (pièce, salle, cathédrale)
- Paramètres : Room Size (taille de la pièce), Damping (absorption), Wet/Dry (dosage)
- Algorithme : Freeverb (classique, qualité correcte, facile à implémenter)

#### Delay (Écho)
- Répétition du son avec un retard configurable
- Paramètres : Time (ms ou synced au BPM), Feedback (nombre de répétitions), Wet/Dry
- Mode sync : le delay se cale sur le tempo (1/4, 1/8, 1/16 de temps)

#### Égaliseur paramétrique (EQ)
- 3 bandes au niveau 4 : Low (grave), Mid (médium), High (aigu)
- Chaque bande : Gain (-12 à +12 dB), Fréquence, Q (largeur)
- Affichage de la courbe de réponse en fréquence (graphique interactif)
- La courbe peut être manipulée par drag des points

#### Compresseur
- Réduit la dynamique (rend les sons forts moins forts et les sons faibles plus forts perceptuellement)
- Paramètres : Threshold (seuil, -40 à 0 dB), Ratio (1:1 à 20:1), Attack (0.1ms à 100ms), Release (10ms à 1s), Makeup Gain (0 à 24 dB)
- Affichage : courbe de transfert (entrée/sortie) + indicateur de réduction de gain

**Architecture des effets** :
```rust
// effects/mod.rs
pub trait Effect: Send {
    fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32);
    fn set_param(&mut self, name: &str, value: f32);
    fn get_param(&self, name: &str) -> f32;
    fn reset(&mut self);
    fn name(&self) -> &str;
}

// effects/effect_chain.rs
pub struct EffectChain {
    effects: Vec<Box<dyn Effect>>,
    bypass: Vec<bool>,
}

impl EffectChain {
    pub fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let mut l = input_l;
        let mut r = input_r;
        for (i, effect) in self.effects.iter_mut().enumerate() {
            if !self.bypass[i] {
                let (new_l, new_r) = effect.process(l, r);
                l = new_l;
                r = new_r;
            }
        }
        (l, r)
    }

    pub fn add_effect(&mut self, effect: Box<dyn Effect>) { ... }
    pub fn remove_effect(&mut self, index: usize) { ... }
    pub fn move_effect(&mut self, from: usize, to: usize) { ... }
}
```

**Implémentation du Reverb (Freeverb simplifié)** :
```rust
// effects/reverb.rs
pub struct Reverb {
    // 8 comb filters + 4 allpass filters (algorithme Freeverb)
    comb_filters: Vec<CombFilter>,
    allpass_filters: Vec<AllpassFilter>,
    room_size: f32,
    damping: f32,
    wet: f32,
    dry: f32,
}

impl Effect for Reverb {
    fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let input = (input_l + input_r) * 0.5; // Mono input
        let mut wet_l = 0.0;
        let mut wet_r = 0.0;

        // Comb filters en parallèle
        for (i, comb) in self.comb_filters.iter_mut().enumerate() {
            let out = comb.process(input);
            if i % 2 == 0 { wet_l += out; } else { wet_r += out; }
        }

        // Allpass filters en série
        wet_l = self.allpass_filters[0].process(wet_l);
        wet_l = self.allpass_filters[1].process(wet_l);
        wet_r = self.allpass_filters[2].process(wet_r);
        wet_r = self.allpass_filters[3].process(wet_r);

        (input_l * self.dry + wet_l * self.wet,
         input_r * self.dry + wet_r * self.wet)
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "room_size" => { self.room_size = value; self.update_comb_filters(); },
            "damping" => { self.damping = value; self.update_comb_filters(); },
            "wet" => self.wet = value,
            "dry" => self.dry = value,
            _ => {}
        }
    }
}
```

**Commandes Rust** :
```rust
#[tauri::command]
fn add_effect(track_id: u32, effect_type: String) -> Result<u32, String>
// effect_type: "reverb", "delay", "eq", "compressor"
// Retourne l'ID de l'effet créé

#[tauri::command]
fn remove_effect(track_id: u32, effect_id: u32) -> Result<(), String>

#[tauri::command]
fn set_effect_param(track_id: u32, effect_id: u32, param: String, value: f32) -> Result<(), String>

#[tauri::command]
fn set_effect_bypass(track_id: u32, effect_id: u32, bypass: bool) -> Result<(), String>

#[tauri::command]
fn move_effect(track_id: u32, effect_id: u32, new_position: u32) -> Result<(), String>
// Réordonne les effets dans la chaîne

#[tauri::command]
fn get_effect_params(track_id: u32, effect_id: u32) -> Result<HashMap<String, f32>, String>
```

**Composants React** :
- `EffectRack.tsx` — Liste verticale des slots d'effets d'une piste (dans le mixer ou dans un panneau dédié)
- `EffectSlot.tsx` — Un slot : nom de l'effet, bouton bypass, bouton supprimer, drag handle pour réordonner
- `EffectSelector.tsx` — Menu pour choisir quel effet ajouter
- `ReverbUI.tsx` — Interface du reverb : 3-4 knobs (room size, damping, wet, dry)
- `DelayUI.tsx` — Interface du delay : knobs time, feedback, wet/dry + toggle sync
- `EqUI.tsx` — Courbe de réponse interactive + knobs par bande
- `CompressorUI.tsx` — Courbe de transfert + knobs threshold, ratio, attack, release, makeup

---

### 4.3 — Enregistrement audio

**Description** : Possibilité d'enregistrer du son depuis un microphone (ou une entrée audio) directement dans une piste de la timeline.

**Spécifications** :
- Bouton Record (●) dans la barre de transport (visible au niveau 4+)
- Workflow :
  1. Sélectionner la piste cible (ou en créer une nouvelle)
  2. Appuyer sur Record → la piste passe en mode "armé" (indicateur rouge)
  3. Appuyer sur Play → l'enregistrement commence
  4. Appuyer sur Stop → l'enregistrement s'arrête, un nouveau clip audio apparaît sur la piste
- Le son enregistré est sauvegardé en WAV 48kHz 32-bit float dans le dossier du projet
- Monitoring : pendant l'enregistrement, le son du micro est audible en temps réel (avec option d'activer/désactiver)
- Indicateur de niveau d'entrée (VU-mètre du micro) visible quand une piste est armée
- Détection automatique du périphérique d'entrée, configurable dans les paramètres

**Commandes Rust** :
```rust
#[tauri::command]
fn list_input_devices() -> Result<Vec<AudioDeviceInfo>, String>

#[tauri::command]
fn set_input_device(device_name: String) -> Result<(), String>

#[tauri::command]
fn arm_track(track_id: u32, armed: bool) -> Result<(), String>
// Active le mode "prêt à enregistrer" pour cette piste

#[tauri::command]
fn set_monitoring(enabled: bool) -> Result<(), String>
// Active/désactive l'écoute du micro en temps réel

#[tauri::command]
fn start_recording() -> Result<(), String>
// Commence l'enregistrement (associé au Play)

#[tauri::command]
fn stop_recording() -> Result<String, String>
// Arrête l'enregistrement et retourne le chemin du fichier WAV créé
```

**Implémentation Rust** :
```rust
// audio/recorder.rs
pub struct Recorder {
    is_recording: bool,
    armed_track_id: Option<u32>,
    buffer: Vec<f32>,         // Buffer d'enregistrement (pré-alloué)
    write_position: usize,
    input_stream: Option<cpal::Stream>,
    monitoring: bool,
}

impl Recorder {
    pub fn start(&mut self, project_dir: &str) -> Result<(), AudioError> {
        // Ouvre un stream d'entrée cpal
        // Le callback d'entrée écrit dans le ring buffer
        self.is_recording = true;
        Ok(())
    }

    pub fn stop(&mut self) -> Result<String, AudioError> {
        self.is_recording = false;
        // Écrire le buffer dans un fichier WAV
        let path = format!("{}/recordings/rec_{}.wav", project_dir, timestamp());
        write_wav(&path, &self.buffer[..self.write_position], 48000, 2)?;
        self.write_position = 0;
        Ok(path)
    }
}
```

---

### 4.4 — Import / Export audio

**Description** : Importer des fichiers audio dans le projet et exporter le mix final.

**Import** :
- Formats supportés : WAV, MP3, OGG, FLAC
- Drag & drop depuis l'explorateur de fichiers du système vers la timeline
- Conversion automatique au format interne (48kHz, f32) via `symphonia`
- Le fichier importé est copié dans le dossier du projet (`project_dir/samples/imported/`)

**Export** :
- Export du mix complet (toutes les pistes mixées) en un seul fichier
- Formats : WAV (qualité maximale), MP3 (pour partager)
- L'export est offline (rendu plus rapide que le temps réel)
- Barre de progression pendant l'export
- Options d'export : format, qualité (MP3: 128/192/320 kbps), normalisation (oui/non)

**Commandes Rust** :
```rust
#[tauri::command]
fn import_audio_file(source_path: String) -> Result<SampleInfo, String>
// → Copie le fichier dans le projet, le convertit si nécessaire,
//   retourne les infos (durée, waveform...)

#[tauri::command]
fn export_project(path: String, format: String, options: ExportOptions) -> Result<(), String>
// → Rendu offline de tout le projet dans un fichier audio
// → Émet des événements de progression : "export://progress" → { percent: f32 }

pub struct ExportOptions {
    pub format: String,        // "wav" ou "mp3"
    pub mp3_bitrate: Option<u32>,  // 128, 192, 320
    pub normalize: bool,
    pub sample_rate: u32,      // 44100 ou 48000
}
```

---

### 4.5 — Automation (basique)

**Description** : Possibilité de programmer des changements de paramètres au cours du temps. Par exemple, augmenter progressivement le volume d'une piste, ou balayer le cutoff d'un filtre.

**Spécifications au niveau 4** :
- Paramètres automatisables : volume de piste, panoramique, et paramètres d'effets
- Affichage : une courbe superposée sur la piste dans la timeline
- Édition : cliquer pour ajouter un point, drag pour le déplacer, double-clic pour le supprimer
- Interpolation linéaire entre les points (courbe en ligne droite)
- Au niveau 5, interpolation courbe (bézier) sera ajoutée

**Structure de données** :
```typescript
interface AutomationLane {
  id: string;
  trackId: string;
  parameter: string;       // "volume", "pan", "effect:reverb:wet", etc.
  points: AutomationPoint[];
  visible: boolean;
}

interface AutomationPoint {
  time: number;    // en beats
  value: number;   // 0.0 à 1.0 (normalisé, mappé au range du paramètre)
}
```

**Commandes Rust** :
```rust
#[tauri::command]
fn add_automation_point(track_id: u32, parameter: String, time: f64, value: f32) -> Result<u32, String>

#[tauri::command]
fn update_automation_point(point_id: u32, time: f64, value: f32) -> Result<(), String>

#[tauri::command]
fn delete_automation_point(point_id: u32) -> Result<(), String>

#[tauri::command]
fn get_automation_lane(track_id: u32, parameter: String) -> Result<Vec<AutomationPoint>, String>
```

**Composants React** :
- `AutomationLane.tsx` — Courbe d'automation superposée sur une piste
- `AutomationPoint.tsx` — Point draggable sur la courbe
- `AutomationSelector.tsx` — Menu déroulant pour choisir quel paramètre automatiser

---

### 4.6 — Améliorations diverses (niveau 4)

**Undo/Redo** :
- Historique des actions (30 étapes minimum)
- Ctrl+Z / Ctrl+Y
- L'historique couvre : ajout/suppression/déplacement de clips, notes, effets, changements de paramètres

**Raccourcis clavier enrichis** :
- Espace : Play/Stop
- R : Record (niveau 4+)
- M : Mute piste sélectionnée
- S : Solo piste sélectionnée
- Ctrl+S : Sauvegarder
- Ctrl+Z / Ctrl+Y : Undo/Redo
- Ctrl+D : Dupliquer clip sélectionné
- Suppr : Supprimer sélection
- +/- : Zoom

**Panneau de paramètres audio** :
- Sélection du périphérique de sortie audio
- Sélection du périphérique d'entrée audio
- Buffer size : 128, 256, 512, 1024 (avec indicateur de latence)
- Sample rate : 44100, 48000

---

## Mise à jour du callback audio

```rust
fn audio_callback(data: &mut [f32], state: &mut AudioState) {
    for frame in data.chunks_mut(2) {
        let mut master_l = 0.0f32;
        let mut master_r = 0.0f32;

        let has_solo = state.tracks.iter().any(|t| t.solo);

        for track in &mut state.tracks {
            // Solo/Mute
            if track.muted { continue; }
            if has_solo && !track.solo { continue; }

            let mut track_l = 0.0f32;
            let mut track_r = 0.0f32;

            // Génération du signal selon le type de piste
            match track.track_type {
                TrackType::Audio => { /* lecture clips */ },
                TrackType::DrumRack => { /* séquenceur */ },
                TrackType::Instrument => { /* synthé + MIDI */ },
            }

            // Appliquer l'automation
            let volume = track.get_automated_value("volume", state.position);
            let pan = track.get_automated_value("pan", state.position);

            // Appliquer volume et pan
            track_l *= volume * pan_left(pan);
            track_r *= volume * pan_right(pan);

            // Chaîne d'effets (inserts)
            let (fx_l, fx_r) = track.effect_chain.process(track_l, track_r);

            // Metering (après effets)
            track.meter.process_sample(fx_l, fx_r);

            // Envoyer au master
            master_l += fx_l;
            master_r += fx_r;
        }

        // Chaîne d'effets master (si niveau 5)
        // let (master_l, master_r) = state.master_effect_chain.process(master_l, master_r);

        // Metering master
        state.master_meter.process_sample(master_l, master_r);

        // Volume master
        frame[0] = (master_l * state.master_volume).clamp(-1.0, 1.0);
        frame[1] = (master_r * state.master_volume).clamp(-1.0, 1.0);
    }
}
```

---

## Checklist de validation Phase 4

- [ ] Le mixer affiche une tranche par piste + la tranche master
- [ ] Les faders de volume fonctionnent et affichent les dB
- [ ] Les knobs de panoramique fonctionnent (son se déplace gauche/droite)
- [ ] Les VU-mètres s'animent en temps réel pendant la lecture
- [ ] Mute/Solo fonctionnent correctement (y compris la logique solo exclusive)
- [ ] On peut ajouter/supprimer/réordonner des effets sur chaque piste
- [ ] La réverbération modifie le son de manière audible
- [ ] Le delay produit des échos corrects, synchronisés au BPM en mode sync
- [ ] L'EQ modifie les fréquences et la courbe graphique correspond
- [ ] Le compresseur réduit la dynamique et l'indicateur de réduction de gain fonctionne
- [ ] L'enregistrement depuis un micro fonctionne
- [ ] Le fichier enregistré apparaît comme clip sur la timeline
- [ ] L'import de fichiers audio (WAV, MP3) fonctionne via drag & drop
- [ ] L'export du projet en WAV et MP3 fonctionne avec la barre de progression
- [ ] L'automation basique fonctionne (ajout de points, lecture des courbes)
- [ ] Undo/Redo fonctionne pour les actions principales
- [ ] Pas de craquements ni de glitchs audio avec les effets activés
