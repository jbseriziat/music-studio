# Phase 3 — Prompts "Mélodiste"

Avant de commencer : mets à jour CLAUDE.md :
```
## Phase en cours
Phase 3 — Mélodiste (voir @docs/SPEC_PHASE_3_MELODISTE.md)
```

---

## Prompt 3.1 — Synthétiseur simple (Rust)

```
Implémente le synthétiseur soustractif basique en Rust tel que décrit dans @docs/SPEC_PHASE_3_MELODISTE.md section 3.2.

Crée les fichiers suivants dans src-tauri/src/synth/ :

1. oscillator.rs :
   - Enum Waveform : Sine, Square, Sawtooth, Triangle
   - Struct Oscillator : waveform, phase (f64), frequency (f64), octave_offset (i8, -2 à +2), detune_cents (f32, -50 à +50)
   - Méthode generate(&mut self, sample_rate: u32) -> f32 : génère un échantillon selon la forme d'onde, avance la phase
   - Méthode set_frequency(&mut self, freq: f64)
   - La génération doit être anti-aliasée pour le Square et Sawtooth (utilise au minimum une méthode polyBLEP basique pour éviter les artefacts)

2. envelope.rs :
   - Struct Envelope : attack (f32 secondes), decay (f32), sustain (f32 0-1), release (f32), state (EnvelopeState), level (f32)
   - Enum EnvelopeState : Idle, Attack, Decay, Sustain, Release
   - Méthode trigger(&mut self) : passe en Attack
   - Méthode release(&mut self) : passe en Release depuis le level actuel
   - Méthode process(&mut self, sample_rate: u32) -> f32 : retourne le niveau d'enveloppe et avance l'état
   - Méthode is_idle(&self) -> bool
   - Valeurs par défaut musicales : A=10ms, D=100ms, S=0.7, R=200ms

3. filter.rs :
   - Struct Filter avec un filtre biquad (coefficients a0, a1, a2, b0, b1, b2 + état x1, x2, y1, y2)
   - Enum FilterType : LowPass (seul actif au niveau 3)
   - Paramètres : cutoff (f32 Hz, 20-20000), resonance (f32, 0-1)
   - Méthode process(&mut self, input: f32) -> f32
   - Méthode update_coefficients(&mut self, sample_rate: u32) : recalcule les coefficients biquad
   - Cutoff par défaut : 8000 Hz, Resonance par défaut : 0.0

4. voice.rs :
   - Struct SynthVoice : oscillator, envelope, filter, note (u8), velocity (u8), active (bool)
   - Méthode process(&mut self, sample_rate: u32) -> f32 : oscillator → filter → × envelope level × velocity

5. synth_engine.rs :
   - Struct SynthEngine : voices (Vec<SynthVoice> de 8 voix), master_volume (f32)
   - Méthode note_on(&mut self, note: u8, velocity: u8) : trouve une voix libre (ou vole la plus ancienne), configure la fréquence avec midi_note_to_freq, trigger l'enveloppe
   - Méthode note_off(&mut self, note: u8) : release l'enveloppe de la voix jouant cette note
   - Méthode process(&mut self, buffer: &mut [f32], sample_rate: u32) : génère et mixe toutes les voix actives
   - Fonction utilitaire midi_note_to_freq(note: u8) -> f64 : 440.0 × 2^((note - 69) / 12)

6. Presets : crée une struct SynthPreset (sérialisable) avec tous les paramètres. Crée 6 presets par défaut :
   - "Piano doux" : Sine, A=5ms, D=300ms, S=0.3, R=500ms, cutoff=4000
   - "Orgue rétro" : Square, A=10ms, D=50ms, S=0.8, R=100ms, cutoff=6000
   - "Flûte magique" : Sine, A=50ms, D=200ms, S=0.6, R=300ms, cutoff=3000
   - "Robot" : Square, A=1ms, D=100ms, S=0.5, R=50ms, cutoff=2000, reso=0.6
   - "Sous-marin" : Triangle, A=100ms, D=500ms, S=0.4, R=1000ms, cutoff=800
   - "Étoile" : Triangle, A=10ms, D=1000ms, S=0.0, R=100ms, cutoff=10000

7. Commandes Tauri :
   - create_synth_track(name: String) -> Result<u32, String>
   - note_on(track_id: u32, note: u8, velocity: u8) -> Result<(), String>
   - note_off(track_id: u32, note: u8) -> Result<(), String>
   - set_synth_param(track_id: u32, param: String, value: f32) -> Result<(), String>
   - load_synth_preset(track_id: u32, preset_name: String) -> Result<(), String>
   - list_synth_presets() -> Result<Vec<PresetInfo>, String>

8. Intègre SynthEngine dans le callback audio, comme un nouveau TrackType::Instrument.

Teste : appelle note_on(track_id, 60, 100) depuis le frontend → tu dois entendre un Do4 (C4) dans les enceintes. Teste les 6 presets pour vérifier qu'ils sonnent tous différemment.
```

---

## Prompt 3.2 — Interface du synthétiseur

```
Crée l'interface frontend du synthétiseur tel que décrit dans @docs/SPEC_PHASE_3_MELODISTE.md section 3.2.

1. src/components/synth/SynthPanel.tsx — Panneau principal du synthé :
   - S'affiche quand on sélectionne une piste Instrument dans la timeline (ou quand on en crée une)
   - Layout : présets en haut, oscillateur au centre, enveloppe en bas à gauche, filtre en bas à droite
   - Masqué par LevelGate level={3}

2. src/components/synth/PresetSelector.tsx :
   - Dropdown avec les noms des presets
   - Boutons ◀ ▶ pour naviguer entre les presets
   - Au changement : appelle load_synth_preset

3. src/components/synth/OscillatorUI.tsx :
   - 4 boutons visuels pour les formes d'onde : chaque bouton dessine la forme (sinus = courbe, square = créneau, saw = dent de scie, triangle)
   - Le bouton actif est surligné
   - Knob ou dropdown pour l'octave (-2 à +2)
   - Knob pour le detune (-50 à +50 cents)
   - Au changement : appelle set_synth_param

4. src/components/synth/EnvelopeUI.tsx :
   - Affichage graphique de la courbe ADSR (SVG ou Canvas) :
     - Montée (Attack), descente (Decay), plateau (Sustain), descente finale (Release)
     - La courbe se met à jour en temps réel quand on change les valeurs
   - 4 knobs : Attack, Decay, Sustain, Release
   - Chaque knob affiche sa valeur en ms ou % en dessous

5. src/components/synth/FilterUI.tsx :
   - Knob Cutoff (20Hz - 20kHz, échelle logarithmique)
   - Knob Resonance (0 - 100%)
   - Mini graphique de la courbe de réponse du filtre (SVG simplifié)

6. src/components/shared/Knob.tsx — Composant potentiomètre rotatif réutilisable :
   - Props : value, min, max, step, label, unit, onChange, color
   - Interaction : clic + drag vertical (haut = augmenter, bas = diminuer)
   - Affichage : cercle avec un indicateur de position (arc coloré + point)
   - Double-clic : remet la valeur par défaut
   - Affiche la valeur numérique en dessous
   - Ce composant sera réutilisé dans le mixer et les effets

7. src/components/synth/WaveformDisplay.tsx :
   - Mini oscilloscope qui montre la forme d'onde en temps réel
   - Utilise un événement Tauri périodique "audio://waveform" qui envoie les derniers échantillons
   - Rendu en Canvas, taille 200×80px

Teste : ouvre le panneau synthé, change de preset, tourne les knobs → les paramètres changent le son en temps réel.
```

---

## Prompt 3.3 — Piano Roll

```
Implémente le piano roll tel que décrit dans @docs/SPEC_PHASE_3_MELODISTE.md section 3.1.

C'est le composant le plus complexe de cette phase. On va le construire étape par étape.

1. Structure de données côté Rust :
   - Ajoute à la piste Instrument un champ midi_clips: Vec<MidiClip>
   - Struct MidiClip : id, notes (Vec<MidiNote>), start (f64 beats), length (f64 beats)
   - Struct MidiNote : id, note (u8), start (f64 beats relatif au clip), duration (f64 beats), velocity (u8)
   - Commandes Tauri :
     - add_midi_clip(track_id: u32, start: f64, length: f64) -> Result<u32, String>
     - add_midi_note(track_id: u32, clip_id: u32, note: u8, start: f64, duration: f64, velocity: u8) -> Result<u32, String>
     - update_midi_note(note_id: u32, note: u8, start: f64, duration: f64, velocity: u8) -> Result<(), String>
     - delete_midi_note(note_id: u32) -> Result<(), String>
   - Mets à jour le callback audio : pour les pistes Instrument en lecture, scanner les MidiClips et déclencher note_on/note_off sur le SynthEngine aux bonnes positions

2. Composants frontend :
   - src/components/piano-roll/PianoRoll.tsx : conteneur principal
     - S'ouvre quand on double-clique sur un clip MIDI dans la timeline
     - Layout : PianoKeys à gauche (fixe), NoteGrid au centre (scrollable), VelocityLane en bas
     - Barre d'outils en haut : sélecteur de quantification (1/4, 1/8, 1/16), bouton retour timeline

   - src/components/piano-roll/PianoKeys.tsx : clavier vertical
     - 4 octaves visibles (C2 à C6), scrollable verticalement
     - Touches blanches (largeur pleine) et noires (largeur réduite, couleur sombre)
     - Nom de note affiché sur les Do (C2, C3, C4, C5, C6)
     - Au clic sur une touche : joue la note (appelle note_on puis note_off après 200ms)
     - La touche s'illumine brièvement au clic

   - src/components/piano-roll/NoteGrid.tsx : grille de notes
     - Rendu en Canvas 2D (pour la performance)
     - Lignes horizontales : alternance gris clair (touches blanches) / gris plus foncé (touches noires)
     - Lignes verticales : mesures (trait épais) et temps (trait fin)
     - Quantification affichée : subdivisions en pointillés légers
     - Interactions :
       a) Clic + drag horizontal dans le vide → crée une note (hauteur = position Y, durée = longueur du drag, snappé à la grille)
       b) Clic sur une note existante → sélection (contour bleu lumineux)
       c) Double-clic sur une note → supprime
       d) Drag d'une note sélectionnée → déplace (X et Y, snappé à la grille)
       e) Drag du bord droit d'une note → redimensionne (durée)
       f) Clic + drag dans le vide avec Ctrl → rectangle de sélection multiple
     - Les notes sont des rectangles colorés (couleur de la piste), la hauteur du rectangle correspond à une ligne de la grille
     - L'opacité de la note reflète la vélocité (plus foncé = plus fort)

   - src/components/piano-roll/VelocityLane.tsx : barres de vélocité en bas
     - Une barre verticale par note, hauteur proportionnelle à la vélocité (0-127)
     - Clic + drag vertical sur une barre pour modifier la vélocité
     - Les barres suivent la même position X que les notes dans le grid

   - src/components/piano-roll/QuantizeSelector.tsx : sélection de quantification
     - Options : 1/4, 1/8 (défaut), 1/16, 1/32
     - Affecte le snap-to-grid lors de la création et du déplacement de notes

3. Quand on joue une note dans le piano roll (clic sur le clavier ou création d'une note), elle doit être audible en temps réel via le synthé de la piste.

Teste : crée une piste instrument, ouvre le piano roll, dessine quelques notes, appuie sur Play → la mélodie se joue via le synthé.
```

---

## Prompt 3.4 — Clavier virtuel et MIDI

```
Implémente le clavier virtuel et le support MIDI externe tels que décrits dans @docs/SPEC_PHASE_3_MELODISTE.md sections 3.3 et 3.6.

1. Clavier virtuel (frontend) :
   - src/components/piano-roll/VirtualKeyboard.tsx : clavier affiché en bas de l'écran
     - Toggle pour afficher/masquer (bouton 🎹 dans la toolbar)
     - 2 octaves visibles, touches blanches et noires dessinées en CSS
     - Mapping AZERTY :
       - Q-S-D-F-G-H-J-K → C-D-E-F-G-A-B-C (touches blanches)
       - Z-E-R-T-Y-U-I → C#-D#-F#-G#-A#-C#-D# (touches noires)
       - W : octave -1, X : octave +1
     - Détecte aussi le clavier QWERTY automatiquement (A-S-D-F... au lieu de Q-S-D-F...)
     - Au keydown : appelle note_on sur la piste sélectionnée
     - Au keyup : appelle note_off
     - Les touches du clavier visuel s'illuminent quand la touche d'ordinateur est pressée
     - Vélocité fixe à 100
   - Hook src/hooks/useKeyboardMidi.ts : gère les événements clavier → MIDI

2. MIDI externe (Rust) :
   - src-tauri/src/midi/midi_engine.rs :
     - Struct MidiEngine : utilise midir pour se connecter aux périphériques MIDI
     - Détection automatique des périphériques au démarrage
     - Le callback MIDI envoie les événements via un canal ringbuf vers le thread audio
     - Enum MidiEvent : NoteOn { channel, note, velocity }, NoteOff { channel, note }, ControlChange { channel, controller, value }
   - Commandes Tauri :
     - list_midi_devices() -> Result<Vec<MidiDeviceInfo>, String>
     - connect_midi_device(device_name: String) -> Result<(), String>
     - disconnect_midi_device() -> Result<(), String>
   - Intégration dans le callback audio : lire les événements MIDI du ringbuf et les router vers le synthé de la piste sélectionnée

3. Indicateur MIDI dans la TransportBar (masqué LevelGate level={3}) :
   - Petite icône MIDI (🎹) qui clignote brièvement quand des données MIDI arrivent
   - Au clic : dropdown avec la liste des périphériques MIDI et leur statut (connecté/déconnecté)

4. Hook src/hooks/useMidi.ts : expose les périphériques MIDI, la connexion/déconnexion, et les événements MIDI en temps réel.

Teste : tape sur le clavier d'ordinateur → le synthé joue les notes. Si tu as un clavier MIDI, branche-le → il joue les notes aussi.
```

---

## Prompt 3.5 — Clips MIDI sur la timeline et polish Phase 3

```
Finalise la Phase 3 en intégrant les clips MIDI dans la timeline et en polissant l'ensemble.

1. Clips MIDI sur la timeline :
   - src/components/timeline/MidiClip.tsx : rendu spécial pour les clips MIDI
     - Affiche les notes en miniature à l'intérieur du clip (petits rectangles colorés sur un mini piano roll)
     - Double-clic sur le clip → ouvre le piano roll complet pour ce clip
   - Pour les pistes Instrument, un bouton "+" permet de créer un nouveau clip MIDI (longueur par défaut : 4 mesures)
   - On peut redimensionner un clip MIDI (drag du bord droit)
   - On peut dupliquer un clip MIDI (Alt + drag)

2. Navigation entre les vues :
   - Double-clic sur un clip MIDI → ouvre le piano roll (la timeline est remplacée par le piano roll)
   - Bouton "↩ Timeline" dans le piano roll pour revenir à la vue timeline
   - Transitions douces entre les vues

3. Copier/Coller de notes dans le piano roll :
   - Ctrl+C : copie les notes sélectionnées
   - Ctrl+V : colle à la position du curseur
   - Ctrl+A : sélectionne toutes les notes

4. Sauvegarde : vérifie que les pistes instrument, les clips MIDI, les notes, et les presets de synthé sont tous sauvegardés dans le fichier projet .msp et restaurés correctement au chargement.

5. Vérifie la cohérence des niveaux :
   - Au niveau 1-2 : aucun élément de la phase 3 n'est visible
   - Au niveau 3 : le piano roll, le synthé, le clavier virtuel sont accessibles
   - Un projet créé au niveau 3 (avec des pistes instrument) joue correctement quand ouvert au niveau 1 (les notes sont jouées mais l'interface du synthé n'est pas visible)

6. Corrige les éventuels problèmes de timing : les notes MIDI doivent se déclencher exactement sur le bon beat, sans décalage.
```

---

## Validation Phase 3

- [ ] Le piano roll affiche une grille correcte avec clavier vertical
- [ ] On peut créer, déplacer, redimensionner et supprimer des notes
- [ ] La quantification (snap) fonctionne (1/4, 1/8, 1/16)
- [ ] La vélocité est modifiable dans le VelocityLane
- [ ] Le synthé produit du son pour les 4 formes d'onde
- [ ] L'enveloppe ADSR modifie le son audiblement
- [ ] Le filtre low-pass coupe les aigus
- [ ] Les 6 presets sonnent différemment
- [ ] Les knobs sont fluides et réactifs
- [ ] Le clavier virtuel (clavier d'ordinateur) joue les notes
- [ ] Le support MIDI externe détecte les périphériques
- [ ] Les clips MIDI apparaissent sur la timeline avec un rendu miniature
- [ ] La lecture timeline joue les notes MIDI au bon moment
- [ ] Tout est sauvegardé/restauré dans le projet
