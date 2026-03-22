# 🚀 Music Studio — Phase 5 : "Producteur Pro" — Synthèse Avancée et Mastering

## Objectif

Compléter l'application avec les fonctionnalités avancées de production : **synthétiseur complet** (double oscillateur, LFO, modulation), **mastering** (limiteur, EQ master, mesure LUFS), **automation courbe**, et fonctionnalités de workflow avancées (groupes de pistes, bus d'effets, sidechain).

**Niveau requis** : 5 (Producteur Pro)

---

## Fonctionnalités de cette phase

### 5.1 — Synthétiseur complet

**Améliorations du synthé par rapport au niveau 3** :

#### Double oscillateur
- 2 oscillateurs indépendants avec chacun : forme d'onde, octave, detune, volume
- Mix entre les deux oscillateurs (crossfader Osc1 ↔ Osc2)
- Mode Unison : un oscillateur peut être "épaissi" en empilant plusieurs voix légèrement désaccordées (1-8 voix unison, spread configurable)
- Formes d'onde supplémentaires : Noise (bruit blanc), PWM (pulse width modulation)

#### LFO (Low Frequency Oscillator)
- Oscillateur lent qui module un paramètre en continu
- 1 LFO au minimum (2 en cible)
- Destinations de modulation : Pitch (vibrato), Cutoff (wah-wah), Volume (tremolo), Pan (auto-pan)
- Paramètres : Waveform (sine, square, triangle, saw, S&H), Rate (0.1 Hz à 20 Hz ou sync au BPM), Depth (intensité)
- Affichage visuel de la forme du LFO et de son effet sur le paramètre ciblé

#### Matrice de modulation (simplifié)
- Sources : Envelope, LFO1, LFO2, Velocity, Note (pitch)
- Destinations : Pitch, Cutoff, Resonance, Volume, Pan, Osc2 Pitch
- Chaque routage a une intensité (amount) de -100% à +100%
- Interface : liste de routages avec source → destination → amount

#### Filtres avancés
- Types : Low-pass 12dB, Low-pass 24dB, High-pass, Band-pass, Notch
- Drive/saturation avant le filtre (léger overdrive)
- Enveloppe de filtre dédiée (ADSR séparé de l'enveloppe d'amplitude)

#### Polyphonie étendue
- 16 voix (au lieu de 8)
- Mode Mono (1 voix) avec glide/portamento
- Legato : si une note est jouée alors qu'une autre est tenue, pas de retrigger de l'enveloppe

**Commandes Rust supplémentaires** :
```rust
#[tauri::command]
fn set_synth_osc2_param(track_id: u32, param: String, value: f32) -> Result<(), String>

#[tauri::command]
fn set_synth_lfo_param(track_id: u32, lfo_index: u8, param: String, value: f32) -> Result<(), String>
// Params: "waveform", "rate", "depth", "destination", "sync"

#[tauri::command]
fn add_modulation_route(track_id: u32, source: String, destination: String, amount: f32) -> Result<u32, String>

#[tauri::command]
fn remove_modulation_route(track_id: u32, route_id: u32) -> Result<(), String>

#[tauri::command]
fn set_synth_mode(track_id: u32, mode: String) -> Result<(), String>
// mode: "poly", "mono", "legato"

#[tauri::command]
fn set_glide_time(track_id: u32, time_ms: f32) -> Result<(), String>
```

**Implémentation Rust** :
```rust
// synth/lfo.rs
pub struct LFO {
    waveform: Waveform,
    rate: f32,           // Hz (ou ratio BPM si sync)
    depth: f32,          // 0.0 - 1.0
    phase: f64,
    sync_to_bpm: bool,
    destination: ModDestination,
}

impl LFO {
    pub fn process(&mut self, sample_rate: u32, bpm: f64) -> f32 {
        let freq = if self.sync_to_bpm {
            bpm / 60.0 * self.rate as f64 // rate = ratio (1 = noire, 0.5 = croche...)
        } else {
            self.rate as f64
        };
        self.phase = (self.phase + freq / sample_rate as f64) % 1.0;
        let value = match self.waveform {
            Waveform::Sine => (self.phase * 2.0 * std::f64::consts::PI).sin(),
            Waveform::Triangle => 4.0 * (self.phase - (self.phase + 0.5).floor()).abs() - 1.0,
            // ...
        };
        value as f32 * self.depth
    }
}

pub enum ModDestination {
    Pitch,
    Cutoff,
    Volume,
    Pan,
    Osc2Pitch,
    Resonance,
}

// synth/synth_engine.rs (mise à jour)
pub struct SynthEngine {
    voices: Vec<SynthVoice>,
    osc2_params: OscillatorParams,    // NOUVEAU
    lfo1: LFO,                        // NOUVEAU
    lfo2: LFO,                        // NOUVEAU
    filter_envelope: Envelope,          // NOUVEAU : enveloppe dédiée au filtre
    mod_routes: Vec<ModRoute>,         // NOUVEAU
    mode: SynthMode,                   // NOUVEAU : Poly, Mono, Legato
    glide_time: f32,                   // NOUVEAU : temps de portamento
    master_volume: f32,
}
```

**Composants React supplémentaires** :
- `Oscillator2UI.tsx` — Deuxième oscillateur (identical au premier + mix slider)
- `LfoUI.tsx` — Interface LFO : forme d'onde, rate, depth, destination
- `ModMatrixUI.tsx` — Tableau de routage source → destination → amount
- `FilterEnvelopeUI.tsx` — ADSR dédié au filtre
- `UnisonUI.tsx` — Contrôle des voix unison (count + spread)
- `SynthModeUI.tsx` — Sélecteur Poly/Mono/Legato + glide

---

### 5.2 — Mastering

**Description** : Chaîne de traitement sur le bus Master, dédiée à la finalisation du son global. Le mastering donne au morceau son volume final, son équilibre fréquentiel, et sa cohérence sonore.

**Modules de mastering** :

#### EQ Master (Égaliseur linéaire)
- 5 bandes (Low shelf, Low-mid, Mid, High-mid, High shelf)
- Chaque bande : Gain, Fréquence, Q
- Analyseur de spectre en temps réel (FFT) superposé à la courbe EQ
- L'analyseur montre le contenu fréquentiel du signal en temps réel

#### Compresseur multibande (optionnel, avancé)
- 3 bandes (low, mid, high) avec crossover configurable
- Chaque bande a son propre compresseur
- Permet de compresser les basses sans affecter les aigus, par exemple

#### Limiteur (Brickwall Limiter)
- Empêche le signal de dépasser 0 dBFS (évite la distorsion numérique)
- Paramètres : Threshold (-12 à 0 dB), Release (auto ou manuel)
- Indicateur de réduction de gain
- C'est le dernier élément de la chaîne, juste avant la sortie

#### Mesure LUFS
- Mesure du volume perçu selon le standard EBU R128
- Affichage : Integrated LUFS (moyenne sur tout le morceau), Short-term (3s), Momentary (400ms)
- Cible recommandée : -14 LUFS (streaming) — affichée comme guide visuel
- True Peak meter (niveau crête inter-échantillon)

**Implémentation Rust** :
```rust
// mixer/master.rs
pub struct MasterChain {
    eq: MasterEq,
    compressor: Option<MultibandCompressor>,  // Optionnel
    limiter: BrickwallLimiter,
    lufs_meter: LufsMeter,
    enabled: bool,
}

// effects/limiter.rs
pub struct BrickwallLimiter {
    threshold: f32,        // en linéaire (ex: 0.891 = -1 dBFS)
    release_ms: f32,
    lookahead_ms: f32,     // 5ms typique
    lookahead_buffer: Vec<f32>,
    gain_reduction: f32,
    attack_coeff: f32,
    release_coeff: f32,
}

impl Effect for BrickwallLimiter {
    fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let peak = input_l.abs().max(input_r.abs());
        let target_gain = if peak > self.threshold {
            self.threshold / peak
        } else {
            1.0
        };

        // Smooth le gain pour éviter les artefacts
        if target_gain < self.gain_reduction {
            self.gain_reduction = target_gain; // Attack instantanée
        } else {
            self.gain_reduction += (target_gain - self.gain_reduction) * self.release_coeff;
        }

        (input_l * self.gain_reduction, input_r * self.gain_reduction)
    }
}

// mixer/lufs_meter.rs
pub struct LufsMeter {
    // Implémentation du standard ITU-R BS.1770 simplifié
    // Pré-filtre K-weighting (2 filtres biquad)
    k_filter_stage1: BiquadFilter,
    k_filter_stage2: BiquadFilter,

    // Buffers pour les différentes fenêtres temporelles
    momentary_buffer: RingBuffer<f32>,    // 400ms
    shortterm_buffer: RingBuffer<f32>,    // 3s
    integrated_sum: f64,
    integrated_count: u64,
}

impl LufsMeter {
    pub fn get_momentary(&self) -> f32 { /* ... calcul LUFS 400ms ... */ }
    pub fn get_shortterm(&self) -> f32 { /* ... calcul LUFS 3s ... */ }
    pub fn get_integrated(&self) -> f32 { /* ... calcul LUFS total ... */ }
}
```

**Commandes Rust** :
```rust
#[tauri::command]
fn set_master_eq_band(band: u8, gain: f32, freq: f32, q: f32) -> Result<(), String>

#[tauri::command]
fn set_limiter_threshold(threshold_db: f32) -> Result<(), String>

#[tauri::command]
fn get_lufs_levels() -> Result<LufsData, String>
// Retourne { momentary, shortterm, integrated, true_peak }

#[tauri::command]
fn set_master_chain_bypass(bypass: bool) -> Result<(), String>

// Événement pour le spectre FFT :
// "audio://spectrum-update" → { bins: Vec<f32> }  (64 ou 128 bins)
```

**Composants React** :
- `MasteringPanel.tsx` — Panneau complet de mastering
- `MasterEqUI.tsx` — EQ 5 bandes avec analyseur de spectre (Canvas)
- `SpectrumAnalyzer.tsx` — FFT en temps réel (barres ou courbe)
- `LimiterUI.tsx` — Threshold + indicateur de réduction de gain
- `LoudnessMeter.tsx` — Affichage LUFS (momentary, short-term, integrated) avec cible -14 LUFS
- `TruePeakMeter.tsx` — Indicateur de true peak

---

### 5.3 — Bus d'effets (Send/Return)

**Description** : Au lieu de mettre un reverb sur chaque piste (coûteux en CPU), on crée un bus d'effet partagé. Chaque piste envoie une portion de son signal vers ce bus via un "send". Le bus traite le signal et le rend au master.

**Spécifications** :
- Possibilité de créer des bus d'effets (ex: "Reverb Bus", "Delay Bus")
- Chaque piste a des knobs "Send" pour doser l'envoi vers chaque bus
- Les bus apparaissent dans le mixer comme des tranches spéciales
- Le signal dans un bus est 100% wet (pas de dry)

**Structure** :
```typescript
interface Bus {
  id: string;
  name: string;
  effects: Effect[];
  volume: number;
  meter: MeterData;
}

// Chaque piste gagne un champ :
interface Track {
  // ... existant ...
  sends: { busId: string; amount: number }[];
}
```

---

### 5.4 — Sidechain Compression

**Description** : Technique de production très courante (surtout en musique électronique). Le compresseur d'une piste est déclenché par le signal d'une autre piste. Exemple typique : le kick (grosse caisse) fait "pomper" la basse — à chaque coup de kick, le volume de la basse baisse automatiquement, puis remonte.

**Spécifications** :
- Le compresseur d'effet a un sélecteur "Sidechain Input" → choisir une autre piste comme source
- Quand le sidechain est activé, le compresseur écoute le signal de la piste source pour décider quand comprimer
- Indicateur visuel du "pompage" (courbe de gain reduction)

---

### 5.5 — Automation courbe (Bézier)

**Amélioration par rapport au niveau 4** :
- Les points d'automation sont reliés par des courbes de Bézier (au lieu de lignes droites)
- Chaque segment a un "tension" handle : clic + drag entre deux points pour courber
- Types de courbes : linéaire, logarithmique, exponentielle, S-curve
- Enregistrement d'automation en temps réel : bouger un knob pendant la lecture enregistre les mouvements

---

### 5.6 — Groupes de pistes

**Description** : Regrouper plusieurs pistes sous un groupe (dossier). Le groupe a son propre fader de volume qui contrôle toutes les pistes du groupe proportionnellement.

**Spécifications** :
- Créer un groupe : sélectionner plusieurs pistes → clic droit → "Grouper"
- Le groupe apparaît dans la timeline et le mixer comme une tranche parent
- Plier/déplier le groupe dans la timeline
- Le fader du groupe multiplie le volume de toutes les pistes enfants

---

### 5.7 — Améliorations de workflow

#### Templates de projet
- Sauvegarder la configuration actuelle (pistes, instruments, effets, routage) comme template
- Au "Nouveau projet", choisir de partir d'un template ou d'un projet vide
- Templates prédéfinis : "Beat Making", "Song Writing", "Sound Design"

#### Marqueurs
- Ajouter des marqueurs nommés sur la timeline (Couplet, Refrain, Bridge, Drop...)
- Navigation rapide entre les marqueurs
- Les marqueurs apparaissent sur la règle temporelle

#### Time signature variable
- Supporter les signatures temporelles autres que 4/4 : 3/4 (valse), 6/8, 5/4, 7/8
- Possibilité de changer de signature en cours de morceau

#### Freeze de piste
- "Geler" une piste instrument → rendre l'audio et désactiver le synthé/effets
- Libère le CPU (utile sur les machines moins puissantes)
- Possibilité de "dégeler" pour rééditer

---

## Architecture finale du moteur audio

```
                    ┌─────────────────────┐
                    │   MIDI Input        │
                    │  (clavier externe)  │
                    └────────┬────────────┘
                             │
    ┌────────────────────────▼────────────────────────┐
    │              AUDIO ENGINE                        │
    │                                                  │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
    │  │ Track 1  │  │ Track 2  │  │ Track 3  │ ...  │
    │  │ (Audio)  │  │(DrumRack)│  │ (Synth)  │      │
    │  │          │  │          │  │          │      │
    │  │ Clips    │  │ Sequencer│  │ MIDI +   │      │
    │  │ → Sample │  │ → Pads   │  │ Oscillators│    │
    │  │   Reader │  │   Player │  │ → Filter  │      │
    │  │          │  │          │  │ → Envelope│      │
    │  ├──────────┤  ├──────────┤  ├──────────┤      │
    │  │Automation│  │Automation│  │Automation│      │
    │  ├──────────┤  ├──────────┤  ├──────────┤      │
    │  │ Volume   │  │ Volume   │  │ Volume   │      │
    │  │ Pan      │  │ Pan      │  │ Pan      │      │
    │  ├──────────┤  ├──────────┤  ├──────────┤      │
    │  │ FX Chain │  │ FX Chain │  │ FX Chain │      │
    │  │[EQ]      │  │[Comp]    │  │[Reverb]  │      │
    │  │[Comp]    │  │          │  │[Delay]   │      │
    │  ├──────────┤  ├──────────┤  ├──────────┤      │
    │  │ Sends    │  │ Sends    │  │ Sends    │      │
    │  │→ Bus A:30│  │→ Bus A:50│  │→ Bus A:70│      │
    │  │→ Bus B:0 │  │→ Bus B:40│  │→ Bus B:20│      │
    │  ├──────────┤  ├──────────┤  ├──────────┤      │
    │  │ Meter    │  │ Meter    │  │ Meter    │      │
    │  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
    │       │             │             │              │
    │       └──────┬──────┴──────┬──────┘              │
    │              │             │                      │
    │    ┌─────────▼──┐  ┌──────▼─────┐               │
    │    │   Bus A    │  │   Bus B    │               │
    │    │ [Reverb]   │  │ [Delay]    │               │
    │    │  Meter     │  │  Meter     │               │
    │    └─────┬──────┘  └──────┬─────┘               │
    │          │                │                       │
    │          └───────┬────────┘                       │
    │                  │                                │
    │        ┌─────────▼─────────┐                     │
    │        │    MASTER BUS     │                     │
    │        │                   │                     │
    │        │  [Master EQ]     │                     │
    │        │  [Multiband Comp]│                     │
    │        │  [Limiter]       │                     │
    │        │                   │                     │
    │        │  LUFS Meter      │                     │
    │        │  True Peak Meter │                     │
    │        │  Spectrum FFT    │                     │
    │        └────────┬──────────┘                     │
    │                 │                                │
    └─────────────────┼────────────────────────────────┘
                      │
                      ▼
              [Sortie Audio / Export]
```

---

## Checklist de validation Phase 5

- [ ] Le synthé a 2 oscillateurs fonctionnels avec mix
- [ ] Le LFO module le pitch, le cutoff, le volume de manière audible
- [ ] La matrice de modulation permet de router source → destination
- [ ] Le mode mono avec glide fonctionne
- [ ] L'EQ master 5 bandes fonctionne avec l'analyseur de spectre
- [ ] Le limiteur empêche le signal de dépasser 0 dBFS
- [ ] La mesure LUFS est affichée (momentary, short-term, integrated)
- [ ] Les bus d'effets (send/return) fonctionnent
- [ ] Le sidechain compression fonctionne (le kick fait pomper la basse)
- [ ] L'automation courbe (bézier) est éditable et lue correctement
- [ ] Les groupes de pistes fonctionnent
- [ ] Les templates de projet se créent et se chargent
- [ ] Les marqueurs s'affichent et permettent la navigation rapide
- [ ] Le freeze de piste fonctionne (rendu + libération CPU)
- [ ] L'ensemble des 5 niveaux cohabite sans bug :
  - [ ] Un projet créé au niveau 5 est lisible au niveau 1 (les éléments non visibles sont joués mais pas affichés)
  - [ ] Un projet créé au niveau 1 peut être enrichi au niveau 5
  - [ ] Le changement de niveau en cours de session ne casse rien
