# Phase 5 — Prompts "Producteur Pro"

Avant de commencer : mets à jour CLAUDE.md :
```
## Phase en cours
Phase 5 — Producteur Pro (voir @docs/SPEC_PHASE_5_PRODUCTEUR_PRO.md)
```

---

## Prompt 5.1 — Synthétiseur avancé : double oscillateur et LFO

```
Étends le synthétiseur avec un deuxième oscillateur et un LFO tel que décrit dans @docs/SPEC_PHASE_5_PRODUCTEUR_PRO.md section 5.1.

1. Côté Rust — Double oscillateur :
   - Ajoute un deuxième Oscillator à chaque SynthVoice
   - Chaque oscillateur a ses propres paramètres (waveform, octave, detune)
   - Ajoute un paramètre osc_mix (f32, 0.0 = 100% osc1, 1.0 = 100% osc2, 0.5 = 50/50)
   - Formes d'onde supplémentaires : Noise (bruit blanc via rand), PulseWidth (carré avec duty cycle variable)
   - Dans voice.rs, le signal = osc1 × (1-mix) + osc2 × mix

2. Côté Rust — LFO :
   - Crée src-tauri/src/synth/lfo.rs : struct LFO
     - waveform: Waveform (Sine, Square, Triangle, Saw, SampleAndHold)
     - rate: f32 (0.1 à 20 Hz, ou ratio BPM si sync)
     - depth: f32 (0.0-1.0)
     - phase: f64
     - sync_to_bpm: bool
     - destination: ModDestination
   - Enum ModDestination : Pitch, Cutoff, Volume, Pan, Osc2Pitch, Resonance
   - Méthode process(sample_rate, bpm) -> f32 : retourne la valeur du LFO (-1 à +1) × depth
   - Ajoute 2 LFOs au SynthEngine (lfo1 et lfo2)
   - Dans le callback de traitement du synthé, appliquer les modulations du LFO aux paramètres ciblés :
     - Pitch → modifie la fréquence (vibrato)
     - Cutoff → modifie la fréquence de coupure du filtre (wah)
     - Volume → modifie le volume (tremolo)

3. Côté Rust — Mode mono et glide :
   - Ajoute SynthMode : Poly, Mono, Legato
   - En mode Mono : une seule voix, les notes se remplacent
   - En mode Legato : une seule voix, pas de retrigger de l'enveloppe si une note est déjà tenue
   - Glide/Portamento : la fréquence glisse vers la nouvelle note sur une durée configurable (glide_time_ms)
   - Implémente le glide comme une interpolation linéaire de la fréquence dans l'oscillateur

4. Commandes Tauri :
   - set_synth_osc2_param(track_id, param, value)
   - set_synth_lfo_param(track_id, lfo_index, param, value)
   - set_synth_mode(track_id, mode: String) — "poly", "mono", "legato"
   - set_glide_time(track_id, time_ms: f32)

5. Frontend :
   - Mets à jour SynthPanel pour inclure (masqué LevelGate level={5}) :
   - src/components/synth/Oscillator2UI.tsx : identique à OscillatorUI + slider osc_mix entre les deux
   - src/components/synth/LfoUI.tsx : sélection waveform, knob rate, knob depth, dropdown destination, toggle sync BPM
   - src/components/synth/SynthModeUI.tsx : 3 boutons radio Poly/Mono/Legato + knob Glide Time
   - Ajoute de nouveaux presets qui utilisent ces fonctionnalités

Teste : active l'osc2 avec un léger detune → le son est plus épais. Active le LFO sur le pitch → vibrato audible. Mode mono + glide → les notes glissent.
```

---

## Prompt 5.2 — Matrice de modulation et filtre avancé

```
Ajoute la matrice de modulation et les filtres avancés au synthétiseur.

1. Matrice de modulation (Rust) :
   - Crée une struct ModRoute : source (ModSource), destination (ModDestination), amount (f32, -1.0 à 1.0)
   - Enum ModSource : Envelope1, Envelope2, LFO1, LFO2, Velocity, NoteNumber
   - Le SynthEngine contient un Vec<ModRoute>
   - À chaque sample, pour chaque voix : calculer la somme des modulations par destination et les appliquer
   - Commandes Tauri :
     - add_modulation_route(track_id, source, destination, amount) -> Result<u32, String>
     - update_modulation_route(route_id, amount) -> Result<(), String>
     - remove_modulation_route(track_id, route_id) -> Result<(), String>

2. Enveloppe de filtre (Rust) :
   - Ajoute une deuxième enveloppe ADSR dédiée au filtre
   - La sortie de cette enveloppe module le cutoff du filtre (amount configurable)
   - Quand la note est jouée, les deux enveloppes sont déclenchées ensemble

3. Filtres avancés (Rust) :
   - Ajoute les types : LowPass12, LowPass24, HighPass, BandPass, Notch
   - Le LowPass24 utilise deux filtres biquad en série (cascade)
   - Ajoute un paramètre drive (0-1) : saturation douce avant le filtre (tanh waveshaping)

4. Frontend :
   - src/components/synth/ModMatrixUI.tsx : tableau de routage
     - Chaque ligne = un routage : dropdown Source → dropdown Destination → slider Amount
     - Bouton "+" pour ajouter un routage, "✕" pour supprimer
     - Maximum 8 routages
   - src/components/synth/FilterEnvelopeUI.tsx : deuxième enveloppe ADSR (mêmes contrôles que l'enveloppe d'amplitude mais avec un label différent)
   - Mets à jour FilterUI.tsx : dropdown pour le type de filtre, knob Drive

Teste : route la vélocité vers le cutoff → les notes jouées fort sonnent plus brillantes. Route le LFO2 vers le pitch de l'osc2 → désaccordage cyclique.
```

---

## Prompt 5.3 — Mastering : EQ Master et Limiteur

```
Implémente la chaîne de mastering telle que décrite dans @docs/SPEC_PHASE_5_PRODUCTEUR_PRO.md section 5.2.

1. Côté Rust :
   - Crée src-tauri/src/mixer/master.rs : struct MasterChain
     - eq: MasterEq (5 bandes), limiter: BrickwallLimiter, lufs_meter: LufsMeter
     - Méthode process(l, r) -> (l, r) : applique EQ → Limiter
     - Méthode is_enabled, set_bypass
   - Intègre dans le callback audio : le signal master passe par la MasterChain avant la sortie

2. EQ Master — 5 bandes :
   - Low Shelf (par défaut 80Hz), Low-Mid Peak (300Hz), Mid Peak (1kHz), High-Mid Peak (4kHz), High Shelf (12kHz)
   - Chaque bande : gain, frequency, Q (filtres biquad)
   - Commandes Tauri : set_master_eq_band(band: u8, gain: f32, freq: f32, q: f32)

3. Analyseur de spectre FFT :
   - Calcul d'une FFT sur les 1024 derniers samples du signal master (utilise une implémentation FFT basique ou la crate rustfft)
   - Résultat : 64 bins de magnitude (en dB)
   - Envoyé au frontend via événement Tauri "audio://spectrum" toutes les 50ms
   - Commande Tauri : get_spectrum() -> Result<Vec<f32>, String>

4. Limiteur Brickwall — src-tauri/src/effects/limiter.rs :
   - Threshold (-12 à 0 dB), release auto
   - Le signal ne dépasse JAMAIS le threshold (brickwall)
   - Expose gain_reduction (f32) pour l'indicateur
   - Commande Tauri : set_limiter_threshold(threshold_db: f32)

5. LUFS Meter — src-tauri/src/mixer/lufs_meter.rs :
   - Implémente le K-weighting (2 filtres biquad pré-filtrage selon ITU-R BS.1770)
   - 3 fenêtres : Momentary (400ms), Short-term (3s), Integrated (tout le morceau)
   - Commande Tauri : get_lufs_levels() -> Result<LufsData, String>
   - Événement Tauri "audio://lufs" toutes les 100ms

6. Frontend :
   - src/components/mastering/MasteringPanel.tsx : panneau complet, masqué LevelGate level={5}
     - Accessible via un bouton dans le MasterStrip du Mixer
   - src/components/mastering/MasterEqUI.tsx :
     - Graphique large (600×200px) avec la courbe EQ superposée à l'analyseur de spectre
     - Analyseur = barres ou courbe semi-transparente colorée en temps réel
     - 5 points draggables sur la courbe EQ
     - Knobs par bande en dessous
   - src/components/mastering/SpectrumAnalyzer.tsx :
     - Rendu Canvas, 64 barres verticales, couleur en dégradé (vert → jaune → rouge)
     - Mise à jour fluide via l'événement "audio://spectrum"
   - src/components/mastering/LimiterUI.tsx :
     - Knob Threshold + indicateur de gain reduction (barre descendante)
     - Quand le limiteur agit, la barre s'allume en orange
   - src/components/mastering/LoudnessMeter.tsx :
     - 3 valeurs affichées : Momentary (M), Short-term (S), Integrated (I) en LUFS
     - Cible -14 LUFS affichée comme ligne de référence
     - Couleur verte si proche de -14, rouge si trop haut ou trop bas

Teste : active l'EQ master → on voit le spectre changer. Active le limiteur → le signal ne clippe plus. La mesure LUFS donne une valeur cohérente.
```

---

## Prompt 5.4 — Bus d'effets (Send/Return)

```
Implémente les bus d'effets send/return tel que décrit dans @docs/SPEC_PHASE_5_PRODUCTEUR_PRO.md section 5.3.

1. Côté Rust :
   - Crée src-tauri/src/mixer/bus.rs : struct EffectBus
     - id, name, effect_chain (EffectChain), volume (f32), meter (Meter)
   - Ajoute à chaque piste un champ sends: Vec<Send> où Send = { bus_id, amount (f32 0-1) }
   - Mets à jour le callback audio :
     a) Pour chaque piste, après le traitement normal, envoyer une copie du signal × send_amount vers chaque bus
     b) Chaque bus traite son signal accumulé à travers sa chaîne d'effets
     c) La sortie de chaque bus (× bus volume) est ajoutée au master
     d) Les bus sont traités AVANT la chaîne de mastering
   - Commandes Tauri :
     - create_bus(name: String) -> Result<u32, String>
     - delete_bus(bus_id: u32) -> Result<(), String>
     - add_bus_effect(bus_id: u32, effect_type: String) -> Result<u32, String>
     - set_send_amount(track_id: u32, bus_id: u32, amount: f32) -> Result<(), String>
     - set_bus_volume(bus_id: u32, volume: f32) -> Result<(), String>

2. Frontend :
   - Les bus apparaissent dans le Mixer comme des ChannelStrips spéciales (couleur distincte, icône 🔀)
   - Chaque ChannelStrip de piste a un ou plusieurs knobs "Send" pour doser l'envoi vers les bus
   - Bouton "Ajouter un Bus" dans le Mixer
   - On peut ajouter des effets sur un bus comme sur une piste

3. Crée 2 bus par défaut au niveau 5 : "Reverb Bus" (avec un Reverb) et "Delay Bus" (avec un Delay). Ça permet d'avoir un seul reverb partagé par toutes les pistes au lieu d'un par piste.

Teste : crée un bus avec un reverb, envoie 3 pistes vers ce bus avec des send amounts différents → chaque piste a un niveau de reverb différent, mais c'est le même reverb.
```

---

## Prompt 5.5 — Sidechain, automation courbe et groupes

```
Implémente le sidechain, l'automation Bézier et les groupes de pistes.

1. Sidechain Compression (Rust) :
   - Modifie le Compressor pour accepter un sidechain_input optionnel (track_id)
   - Quand le sidechain est actif, le compresseur utilise le signal de la piste source pour calculer le gain de réduction, mais applique cette réduction au signal de la piste courante
   - Dans le callback audio, il faut calculer le signal de la piste source AVANT de traiter la piste avec le sidechain
   - Commande Tauri : set_sidechain_source(track_id: u32, effect_id: u32, source_track_id: u32) -> Result<(), String>
   - Frontend : dans CompressorUI, ajoute un dropdown "Sidechain Source" listant les autres pistes

2. Automation courbe Bézier :
   - Côté Rust : modifie l'interpolation entre les points d'automation
     - Chaque segment entre 2 points a un paramètre curve_type : Linear, EaseIn (log), EaseOut (exp), SCurve
     - Ajoute curve_type au AutomationPoint
   - Côté frontend : dans AutomationLane, entre deux points, un handle de tension apparaît
     - Drag le handle → change le type de courbe (visuellement la ligne se courbe)
     - Menu clic droit sur un segment : choisir Linear / Ease In / Ease Out / S-Curve
   - Enregistrement d'automation : pendant la lecture, si on bouge un knob ou un fader, les mouvements sont enregistrés comme points d'automation

3. Groupes de pistes :
   - Côté Rust : struct TrackGroup { id, name, track_ids: Vec<u32>, volume: f32 }
     - Le volume du groupe multiplie le volume de chaque piste enfant
   - Commandes Tauri :
     - create_track_group(name: String, track_ids: Vec<u32>) -> Result<u32, String>
     - dissolve_track_group(group_id: u32) -> Result<(), String>
     - set_group_volume(group_id: u32, volume: f32) -> Result<(), String>
   - Frontend : dans la timeline, les pistes groupées sont sous un "dossier" dépliable
     - Header de groupe avec nom, couleur, fader de volume mini
     - Bouton plier/déplier
     - Le Mixer affiche une ChannelStrip pour le groupe (avant ses pistes enfants)

Teste : sidechain → le kick fait pomper la basse. Automation courbe → les transitions sont fluides. Groupes → un fader contrôle plusieurs pistes.
```

---

## Prompt 5.6 — Workflow avancé et polish final

```
Implémente les fonctionnalités de workflow avancées et fais le polish final de l'application.

1. Templates de projet :
   - Commande Tauri : save_as_template(name: String) -> Result<(), String>
     - Sauvegarde la config actuelle (pistes, instruments, effets, routage) sans les clips/notes
     - Stocké dans ~/MusicStudio/Templates/
   - Commande Tauri : list_templates() -> Result<Vec<TemplateInfo>, String>
   - Commande Tauri : load_template(name: String) -> Result<(), String>
   - 3 templates prédéfinis :
     - "Beat Making" : 1 drum rack + 1 piste audio (samples)
     - "Song Writing" : 1 piste instrument (piano) + 1 piste audio (voix) + 1 drum rack
     - "Sound Design" : 1 piste instrument (synthé avec presets complexes)
   - Dans le dialogue "Nouveau projet", proposer de partir d'un template

2. Marqueurs sur la timeline :
   - Struct Marker { id, name, position (beats), color }
   - Affichés sur la TimeRuler comme des drapeaux colorés avec le nom
   - Double-clic sur la règle → créer un marqueur (nom par défaut : "Marqueur 1")
   - Clic sur un marqueur → déplace le playhead à cette position
   - Menu clic droit : renommer, changer couleur, supprimer
   - Noms suggérés : Intro, Couplet, Refrain, Bridge, Drop, Outro

3. Freeze de piste :
   - Commande Tauri : freeze_track(track_id: u32) -> Result<(), String>
     - Fait un rendu offline de la piste (synthé + effets) en WAV
     - Désactive le synthé et les effets (libère le CPU)
     - La piste joue maintenant le WAV rendu
   - Commande Tauri : unfreeze_track(track_id: u32) -> Result<(), String>
     - Réactive le synthé et les effets, supprime le WAV temporaire
   - Indicateur visuel : ❄️ sur la piste gelée

4. Polish final de l'application entière :
   - Vérifie la cohérence de TOUS les niveaux :
     - Profil niveau 1 → seuls les pads, la timeline simple et le sample browser
     - Profil niveau 2 → + drum rack, step sequencer, BPM, loop, métronome
     - Profil niveau 3 → + piano roll, synthé basique, MIDI, clavier virtuel
     - Profil niveau 4 → + mixer, effets, recording, export, automation
     - Profil niveau 5 → + tout (synthé avancé, mastering, bus, sidechain, groupes)
   - Un projet créé au niveau 5 joue correctement à n'importe quel niveau
   - Pas de crash au changement de profil en cours de session
   - L'auto-save fonctionne à tous les niveaux

5. Performance :
   - Vérifie : pas de craquements audio avec 8+ pistes, effets actifs, et mastering
   - Si le CPU est trop chargé, affiche un indicateur dans le header (barre de charge CPU)
   - Le freeze de piste doit effectivement réduire la charge CPU
```

---

## Validation Phase 5 (et validation globale)

### Synthétiseur avancé
- [ ] Double oscillateur avec mix fonctionne
- [ ] LFO module pitch/cutoff/volume audiblement
- [ ] Matrice de modulation fonctionne (8 routages)
- [ ] Mode mono + glide fonctionne
- [ ] Filtres avancés (LP12, LP24, HP, BP, Notch) sonnent différemment
- [ ] Enveloppe de filtre module le cutoff

### Mastering
- [ ] EQ master 5 bandes fonctionne avec graphique interactif
- [ ] Analyseur de spectre FFT s'affiche en temps réel
- [ ] Le limiteur empêche le signal de clipper
- [ ] La mesure LUFS affiche des valeurs cohérentes

### Routing avancé
- [ ] Les bus d'effets send/return fonctionnent
- [ ] Le sidechain fait pomper la basse avec le kick
- [ ] Les groupes de pistes fonctionnent (fader commun)

### Workflow
- [ ] Les templates se créent et se chargent
- [ ] Les marqueurs s'affichent sur la timeline
- [ ] Le freeze de piste réduit le CPU
- [ ] L'automation courbe (Bézier) fonctionne

### Validation globale multi-niveaux
- [ ] Niveau 1 → fonctionne seul, aucun élément niv.2+ visible
- [ ] Niveau 2 → tout le niv.1 + drum rack, BPM, loop
- [ ] Niveau 3 → tout niv.1-2 + piano roll, synthé, MIDI
- [ ] Niveau 4 → tout niv.1-3 + mixer, effets, recording
- [ ] Niveau 5 → tout est accessible
- [ ] Projet créé au niv.5 lisible au niv.1 (audio joué, UI masquée)
- [ ] Changement de profil en cours de session = pas de crash
- [ ] L'application compile et fonctionne sur Linux ET Windows
