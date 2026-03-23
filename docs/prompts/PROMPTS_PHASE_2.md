# Phase 2 — Prompts "Petit Producteur"

Avant de commencer : mets à jour CLAUDE.md :
```
## Phase en cours
Phase 2 — Petit Producteur (voir @docs/SPEC_PHASE_2_PETIT_PRODUCTEUR.md)
```

---

## Prompt 2.1 — Contrôle du BPM et horloge musicale

```
Implémente le contrôle du tempo et l'horloge musicale telle que décrite dans @docs/SPEC_PHASE_2_PETIT_PRODUCTEUR.md sections 2.3 et 2.5.

1. Côté Rust, mets à jour src-tauri/src/transport/transport.rs :
   - Ajoute le champ bpm (f64, défaut 120.0) à la struct Transport
   - Ajoute la conversion position en secondes ↔ position en beats :
     - beats = secondes × (bpm / 60.0)
     - secondes = beats × (60.0 / bpm)
   - Ajoute samples_per_beat : (sample_rate × 60) / bpm
   - Ajoute samples_per_step (pour le séquenceur) : samples_per_beat / 4 (une double-croche)
   - La méthode advance() incrémente aussi un compteur de beat/step
   - Ajoute AudioCommand::SetTempo(f64)
   - Commande Tauri : set_bpm(bpm: f64) -> Result<(), String>
   - Commande Tauri : get_bpm() -> Result<f64, String>

2. Côté frontend, crée src/components/transport/BpmControl.tsx :
   - Affiché dans la TransportBar, masqué par LevelGate level={2}
   - Affichage numérique du BPM : "120 BPM"
   - Contrôle : clic + drag vertical pour changer la valeur (drag vers le haut = augmenter)
   - Boutons +/- de chaque côté pour ajuster par pas de 1
   - Plage : 40 à 240 BPM
   - Double-clic sur le nombre : champ éditable pour taper une valeur
   - Emoji de vitesse à côté : 🐢 (< 80), 🚶 (80-119), 🏃 (120-159), 🚀 (160+)

3. Mets à jour la TimeRuler de la timeline :
   - Au niveau 2+, basculer l'affichage de secondes vers mesures/temps
   - Format : "1.1", "1.2", "1.3", "1.4", "2.1"... (mesure.temps)
   - Le snap-to-grid s'aligne sur les temps au lieu des demi-secondes
   - Ajoute le zoom horizontal : Ctrl + molette souris pour zoomer/dézoomer

4. Mets à jour transportStore.ts pour inclure bpm et les actions setBpm.

Teste : change le BPM, vérifie que le compteur de temps et la règle temporelle s'adaptent.
```

---

## Prompt 2.2 — Drum Rack

```
Implémente le Drum Rack tel que décrit dans @docs/SPEC_PHASE_2_PETIT_PRODUCTEUR.md section 2.1.

1. Côté Rust :
   - Crée src-tauri/src/drums/drum_rack.rs : struct DrumRack
     - 8 pads (extensible à 16), chacun avec : sample_id, volume (f32), pitch_semitones (f32)
     - Chaque pad a un système de voix (max 4 par pad) pour la polyphonie
     - Méthode trigger_pad(pad_index, velocity) : déclenche la lecture du sample
     - Méthode get_output() -> (f32, f32) : retourne le mix stéréo de toutes les voix actives
   - Mets à jour audio/commands.rs : ajoute TriggerDrumPad { track_id: u32, pad_index: u8 }
   - Commandes Tauri :
     - create_drum_rack_track(name: String) -> Result<u32, String>
     - trigger_drum_pad(track_id: u32, pad_index: u8) -> Result<(), String>
     - set_drum_pad_sample(track_id: u32, pad_index: u8, sample_path: String) -> Result<(), String>
     - set_drum_pad_volume(track_id: u32, pad_index: u8, volume: f32) -> Result<(), String>
     - set_drum_pad_pitch(track_id: u32, pad_index: u8, pitch_semitones: f32) -> Result<(), String>

2. Prépare des kits de batterie par défaut :
   - Crée un fichier samples/kits/default.json qui mappe les 8 pads vers les samples drums existants :
     Pad 0: Kick, Pad 1: Snare, Pad 2: Closed HH, Pad 3: Open HH, Pad 4: Clap, Pad 5: Tom Low, Pad 6: Tom Mid, Pad 7: Tom High
   - Commande Tauri : load_drum_kit(track_id: u32, kit_name: String) -> Result<(), String>
   - Commande Tauri : list_drum_kits() -> Result<Vec<DrumKitInfo>, String>
   - Si les samples n'existent pas encore, génère-les programmatiquement en Rust (synthèse basique : kick = sinus avec pitch decay, snare = noise + sinus, hihat = noise filtré passe-haut, etc.)

3. Côté frontend :
   - src/components/drum-rack/DrumRack.tsx : conteneur principal
     - Grille 2×4 de pads (8 pads)
     - Sélecteur de kit en haut (dropdown)
     - Chaque pad est plus petit que les SoundPads (80x80px) car il y a aussi le séquenceur à côté
   - src/components/drum-rack/DrumPad.tsx : un pad de drum
     - Affiche le nom du son (Kick, Snare...) et une couleur
     - Au clic : déclenche trigger_drum_pad
     - Animation de pulse au déclenchement
     - Au clic droit : menu avec "Changer le son", "Volume", "Pitch"
   - Le Drum Rack s'affiche quand on sélectionne une piste de type DrumRack dans la timeline

4. Mets à jour tracksStore pour supporter le type DrumRack.

Teste : crée une piste Drum Rack, les 8 pads jouent les bons sons au clic.
```

---

## Prompt 2.3 — Step Sequencer

```
Implémente le séquenceur pas-à-pas tel que décrit dans @docs/SPEC_PHASE_2_PETIT_PRODUCTEUR.md section 2.2.

1. Côté Rust :
   - Crée src-tauri/src/drums/pattern.rs : struct DrumPattern
     - steps: u8 (16 par défaut)
     - pads: HashMap<u8, PadPattern> où PadPattern contient steps: Vec<bool> et velocities: Vec<u8>
     - Sérialisable avec serde
   - Crée src-tauri/src/drums/sequencer.rs : struct StepSequencer
     - pattern: DrumPattern
     - current_step: usize
     - samples_per_step: f64 (calculé depuis le BPM)
     - sample_counter: f64
     - Méthode process_tick() -> Vec<(u8, f32)> : retourne les pads à déclencher sur ce sample
     - Méthode update_bpm(bpm, sample_rate) : recalcule samples_per_step
   - Intègre le StepSequencer dans DrumRack
   - Mets à jour le callback audio : pour chaque piste DrumRack, appeler sequencer.process_tick() et déclencher les pads correspondants
   - Commandes Tauri :
     - set_drum_pattern(track_id: u32, pattern: DrumPattern) -> Result<(), String>
     - set_step(track_id: u32, pad_index: u8, step: u8, active: bool) -> Result<(), String>
     - get_current_step(track_id: u32) -> Result<u8, String>

2. Côté frontend :
   - src/components/drum-rack/StepSequencer.tsx : grille 8 lignes × 16 colonnes
     - Affichée à droite ou en dessous du DrumRack
     - Layout CSS Grid
   - src/components/drum-rack/StepRow.tsx : une ligne (un pad)
     - Le nom du pad à gauche
     - 16 cases cliquables à droite
   - src/components/drum-rack/StepCell.tsx : une case
     - Toggle au clic : active (couleur du pad) ↔ inactive (gris foncé)
     - Les groupes de 4 steps ont un fond légèrement différent (repère visuel des temps)
     - Séparateur visuel plus épais tous les 4 steps
   - src/components/drum-rack/StepCursor.tsx : colonne lumineuse semi-transparente
     - Se déplace sur le step en cours pendant la lecture
     - Position mise à jour via get_current_step ou un événement Tauri

3. Le step sequencer envoie set_step au Rust à chaque toggle de case (pas besoin d'envoyer tout le pattern à chaque fois).

4. Pendant la lecture :
   - Le curseur lumineux avance step par step
   - Les pads du DrumRack clignotent quand ils sont déclenchés par le séquenceur (même animation que le clic)

Teste : programme un beat basique (kick sur 1 et 3, snare sur 2 et 4, hihat sur chaque step), appuie sur Play → le rythme joue en boucle correctement au bon tempo.
```

---

## Prompt 2.4 — Loop et Métronome

```
Implémente le mode boucle et le métronome tels que décrits dans @docs/SPEC_PHASE_2_PETIT_PRODUCTEUR.md sections 2.4 et 2.6.

1. Mode Loop (Rust) :
   - Ajoute à Transport : loop_enabled (bool), loop_start (f64 en beats), loop_end (f64 en beats)
   - Quand la position atteint loop_end et loop_enabled est true, remet la position à loop_start
   - AudioCommand::SetLoop { enabled: bool, start: f64, end: f64 }
   - Commande Tauri : set_loop(enabled: bool, start: f64, end: f64) -> Result<(), String>

2. Mode Loop (frontend) :
   - Bouton Loop dans TransportBar (masqué par LevelGate level={2}) : icône 🔁
   - Toggle on/off, le bouton s'illumine quand actif
   - Sur la TimeRuler : deux marqueurs draggables (début et fin de boucle)
   - La zone de boucle est surlignée en bleu semi-transparent sur la timeline
   - Par défaut : la boucle couvre la mesure 1 (4 temps)
   - Mets à jour transportStore avec loopEnabled, loopStart, loopEnd

3. Métronome (Rust) :
   - Crée src-tauri/src/transport/metronome.rs : struct Metronome
     - enabled: bool, volume: f32
     - Génère 2 sons courts : accent (premier temps, sinus 1000Hz) et click (autres temps, sinus 800Hz)
     - Durée de chaque clic : 20ms avec decay rapide
   - Intègre dans le callback audio : si métronome enabled et is_playing, jouer le clic au début de chaque beat
   - Le métronome n'est PAS mixé dans l'export (c'est un outil, pas un instrument)
   - AudioCommand::SetMetronome { enabled: bool, volume: f32 }
   - Commande Tauri : set_metronome(enabled: bool) -> Result<(), String>
   - Commande Tauri : set_metronome_volume(volume: f32) -> Result<(), String>

4. Métronome (frontend) :
   - src/components/transport/MetronomeToggle.tsx : bouton dans TransportBar (LevelGate level={2})
   - Icône : 🔔 ou icône métronome
   - Toggle on/off

5. Mets à jour la timeline — Mute/Solo par piste :
   - Ajoute des boutons M (mute) et S (solo) sur chaque Track header
   - Commandes Tauri existantes : set_track_mute et set_track_solo
   - Côté Rust dans le callback audio : respecter le mute/solo (si une piste est en solo, les autres sont mutées sauf celles aussi en solo)

Teste : active le loop → la lecture revient au début de la zone de boucle. Active le métronome → on entend le clic en rythme.
```

---

## Prompt 2.5 — Intégration et polish Phase 2

```
Fais un pass de finition sur la Phase 2.

1. Intégration du Drum Rack dans la timeline :
   - Quand une piste DrumRack existe, elle apparaît dans la timeline
   - Le clip du DrumRack sur la timeline affiche un résumé visuel du pattern (mini step sequencer en lecture seule : des petites cases colorées)
   - Créer un composant DrumClip.tsx pour ce rendu spécial

2. L'interface Drum Rack + Step Sequencer :
   - Le panneau Drum Rack s'affiche dans la zone principale quand on double-clique sur une piste DrumRack dans la timeline
   - Layout : les pads à gauche, le step sequencer à droite
   - Bouton "Retour à la timeline" en haut

3. Vérifie que le BPM modifie bien :
   - La vitesse du step sequencer
   - La vitesse de lecture de la timeline
   - Le rythme du métronome
   - La taille des steps visuels dans le séquenceur

4. Le changement de BPM en temps réel (pendant la lecture) ne doit pas causer de glitch audio.

5. Vérifie que les drum patterns sont sauvegardés dans le projet .msp et restaurés au chargement.

6. Le passage du niveau 1 au niveau 2 (via changement de profil) doit faire apparaître les nouveaux éléments sans bug (BPM, loop, métronome, step sequencer). Teste en basculant entre un profil niveau 1 et un profil niveau 2.
```

---

## Validation Phase 2

- [ ] Le contrôle BPM fonctionne (40-240, affichage emoji de vitesse)
- [ ] Le Drum Rack affiche 8 pads avec le kit par défaut
- [ ] On peut changer le son de chaque pad
- [ ] Le step sequencer affiche 8×16 cases fonctionnelles
- [ ] Le toggle des cases fonctionne
- [ ] Le curseur de lecture se déplace sur la grille
- [ ] Le pattern joue correctement au bon tempo
- [ ] Le mode boucle fonctionne
- [ ] Le métronome bat le tempo correctement
- [ ] Mute/Solo par piste fonctionnent
- [ ] La timeline affiche des mesures/temps (niveau 2+)
- [ ] Le zoom fonctionne
- [ ] Les patterns sont sauvegardés avec le projet
- [ ] Pas de glitch audio au changement de BPM
