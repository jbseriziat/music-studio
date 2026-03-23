# Phase 4 — Prompts "Studio"

Avant de commencer : mets à jour CLAUDE.md :
```
## Phase en cours
Phase 4 — Studio (voir @docs/SPEC_PHASE_4_STUDIO.md)
```

---

## Prompt 4.1 — Mixer : faders et VU-mètres

```
Implémente le mixer (console de mixage) tel que décrit dans @docs/SPEC_PHASE_4_STUDIO.md section 4.1.

1. Côté Rust — Metering :
   - Crée src-tauri/src/mixer/metering.rs : struct Meter
     - Champs : peak_l, peak_r, rms_sum_l, rms_sum_r, rms_count
     - Méthode process_sample(left, right) : met à jour les peak et les sommes RMS
     - Méthode get_and_reset() -> MeterData : retourne les valeurs et remet à zéro
   - Ajoute un Meter par piste et un Meter master dans le callback audio
   - Crée un événement Tauri périodique (toutes les 33ms ≈ 30fps) : "audio://meters"
     - Payload : Vec<TrackMeterData> avec { track_id, peak_l, peak_r, rms_l, rms_r } pour chaque piste + le master
   - Le metering se fait APRÈS les effets et le volume/pan

2. Côté Rust — Conversions dB :
   - Ajoute des fonctions utilitaires : linear_to_db(v: f32) -> f32, db_to_linear(db: f32) -> f32
   - Les faders sont stockés en linéaire dans le moteur audio mais affichés en dB dans l'UI
   - Commande Tauri mise à jour : set_track_volume_db(track_id, volume_db) convertit en linéaire côté Rust

3. Côté frontend — Vue Mixer :
   - src/components/mixer/Mixer.tsx : conteneur principal
     - Vue alternative à la timeline (toggle bouton "Timeline / Mixer" dans le header)
     - Layout horizontal scrollable : une ChannelStrip par piste + MasterStrip à droite
     - Masqué par LevelGate level={4}

   - src/components/mixer/ChannelStrip.tsx : une tranche de mixage (largeur ~80px)
     - De haut en bas :
       a) Nom de la piste (éditable) + icône du type (🎵 Audio / 🥁 Drums / 🎹 Instrument)
       b) Zone d'insert d'effets (vide pour l'instant, on l'ajoutera au prompt 4.2)
       c) Knob panoramique (utilise le composant Knob.tsx existant)
       d) Boutons S (Solo) et M (Mute) — déjà câblés au Rust depuis la Phase 2
       e) Fader vertical
       f) VU-mètre stéréo
       g) Valeur numérique en dB

   - src/components/mixer/MasterStrip.tsx : tranche master (largeur ~120px)
     - Comme ChannelStrip mais sans panoramique, VU-mètre plus grand

   - src/components/shared/Fader.tsx : composant fader vertical réutilisable
     - Props : value (dB), min (-60), max (+6), onChange, color
     - Le fader est un track vertical avec un thumb draggable
     - Échelle dB non linéaire : plus de précision autour de 0 dB
     - Double-clic → remet à 0 dB
     - Affiche une graduation avec les repères : -60, -30, -18, -12, -6, 0, +6

   - src/components/mixer/VuMeter.tsx : indicateur de niveau stéréo
     - 2 barres verticales (gauche/droite)
     - Couleurs segmentées : vert (< -12 dB), jaune (-12 à -3 dB), rouge (> -3 dB)
     - Peak hold : un petit trait blanc reste au niveau max pendant 1.5 secondes
     - Mise à jour fluide via l'événement "audio://meters"
     - Animation CSS smooth (transition sur la hauteur)

4. Crée src/stores/mixerStore.ts pour l'état des canaux (volumes, pans, mutes, solos, meter data).

5. Le Knob de panoramique :
   - Range -100 (tout à gauche) à +100 (tout à droite), 0 = centre
   - Label "L" et "R" de chaque côté
   - Appelle set_track_pan via IPC

Teste : la vue Mixer affiche toutes les pistes, les faders bougent le volume, les VU-mètres s'animent pendant la lecture, le panoramique déplace le son gauche/droite.
```

---

## Prompt 4.2 — Effets audio (Reverb et Delay)

```
Implémente la réverbération et le delay tels que décrits dans @docs/SPEC_PHASE_4_STUDIO.md section 4.2.

1. Architecture des effets (Rust) :
   - src-tauri/src/effects/mod.rs : définir le trait Effect
     - fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32)
     - fn set_param(&mut self, name: &str, value: f32)
     - fn get_param(&self, name: &str) -> f32
     - fn reset(&mut self)
     - fn name(&self) -> &str
   - src-tauri/src/effects/effect_chain.rs : struct EffectChain
     - Vec<Box<dyn Effect>>, Vec<bool> (bypass par effet)
     - Méthode process(l, r) -> (l, r) : applique les effets en série
     - Méthodes add_effect, remove_effect, move_effect, set_bypass
   - Ajoute un EffectChain à chaque piste
   - Mets à jour le callback audio : après le volume/pan, appliquer la chaîne d'effets

2. Reverb — src-tauri/src/effects/reverb.rs :
   - Implémentation Freeverb : 8 comb filters + 4 allpass filters
   - Chaque comb filter : buffer circulaire, feedback, damping
   - Paramètres : room_size (0.0-1.0), damping (0.0-1.0), wet (0.0-1.0), dry (0.0-1.0)
   - Les longueurs des comb filters sont des nombres premiers (pour éviter les résonances) :
     1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116 samples (pour 48kHz)
   - Les allpass filters : longueurs 225, 556, 441, 341

3. Delay — src-tauri/src/effects/delay.rs :
   - Buffer circulaire pour le delay
   - Paramètres : time_ms (1-2000ms), feedback (0.0-0.95), wet (0.0-1.0), dry (0.0-1.0)
   - Mode sync au BPM (optionnel) : time = durée d'une noire, croche, etc.
   - Filtre passe-bas dans la boucle de feedback (pour un son plus naturel, les répétitions perdent les aigus)

4. Commandes Tauri :
   - add_effect(track_id: u32, effect_type: String) -> Result<u32, String>
     effect_type : "reverb" ou "delay"
   - remove_effect(track_id: u32, effect_id: u32) -> Result<(), String>
   - set_effect_param(track_id: u32, effect_id: u32, param: String, value: f32) -> Result<(), String>
   - set_effect_bypass(track_id: u32, effect_id: u32, bypass: bool) -> Result<(), String>
   - get_effect_params(track_id: u32, effect_id: u32) -> Result<HashMap<String, f32>, String>

5. Frontend — EffectRack dans le Mixer :
   - src/components/effects/EffectRack.tsx : zone d'inserts dans la ChannelStrip
     - Bouton "+" pour ajouter un effet (dropdown : Reverb, Delay, EQ, Compressor)
     - Liste verticale des effets insérés
   - src/components/effects/EffectSlot.tsx : un slot d'effet
     - Nom de l'effet, bouton bypass (on/off), bouton supprimer ✕
     - Au clic : ouvre le panneau de détails de l'effet
   - src/components/effects/ReverbUI.tsx : 4 knobs (Room Size, Damping, Wet, Dry)
   - src/components/effects/DelayUI.tsx : 4 knobs (Time, Feedback, Wet, Dry) + toggle Sync BPM

Teste : ajoute un reverb sur une piste → le son a de l'espace. Ajoute un delay → on entend les échos. Le bypass coupe l'effet.
```

---

## Prompt 4.3 — Effets audio (EQ et Compresseur)

```
Implémente l'égaliseur et le compresseur tels que décrits dans @docs/SPEC_PHASE_4_STUDIO.md section 4.2.

1. EQ paramétrique — src-tauri/src/effects/eq.rs :
   - 3 bandes au niveau 4 : Low (shelving), Mid (peaking), High (shelving)
   - Chaque bande : gain (-12 à +12 dB), frequency (20-20000 Hz), Q (0.1-10)
   - Chaque bande utilise un filtre biquad
   - Paramètres par défaut :
     - Low : freq=200, gain=0, Q=0.7
     - Mid : freq=1000, gain=0, Q=1.0
     - High : freq=5000, gain=0, Q=0.7

2. Compresseur — src-tauri/src/effects/compressor.rs :
   - Paramètres : threshold (-40 à 0 dB), ratio (1:1 à 20:1), attack (0.1 à 100ms), release (10 à 1000ms), makeup_gain (0 à 24 dB)
   - Algorithme : détection de l'enveloppe du signal (peak ou RMS), calcul du gain de réduction, smoothing attack/release
   - Expose un champ gain_reduction (f32) pour l'indicateur visuel
   - Valeurs par défaut : threshold=-20, ratio=4, attack=10ms, release=100ms, makeup=0

3. Frontend :
   - src/components/effects/EqUI.tsx :
     - Graphique de la courbe de réponse en fréquence (Canvas ou SVG, 300×150px)
     - Axe X : fréquence (20Hz-20kHz, échelle logarithmique), Axe Y : gain (-12 à +12 dB)
     - 3 points draggables sur la courbe (un par bande)
     - Drag horizontal = change la fréquence, drag vertical = change le gain
     - 3 paires de knobs sous le graphique : Gain + Freq par bande
     - La courbe se met à jour en temps réel

   - src/components/effects/CompressorUI.tsx :
     - Graphique de la courbe de transfert (Canvas ou SVG, 150×150px)
       - Axe X : niveau d'entrée, Axe Y : niveau de sortie
       - La courbe montre le "coude" du compresseur au threshold
     - Indicateur de réduction de gain : barre verticale orange qui descend quand le compresseur agit
     - 5 knobs : Threshold, Ratio, Attack, Release, Makeup Gain

4. Mets à jour EffectRack : les types "eq" et "compressor" sont maintenant disponibles dans le dropdown d'ajout d'effet.

Teste : ajoute un EQ → booste les basses, coupe les aigus, ça s'entend. Ajoute un compresseur → les sons forts sont atténués, l'indicateur de gain reduction bouge.
```

---

## Prompt 4.4 — Enregistrement audio et import/export

```
Implémente l'enregistrement micro et l'import/export audio tel que décrit dans @docs/SPEC_PHASE_4_STUDIO.md sections 4.3 et 4.4.

1. Enregistrement (Rust) :
   - src-tauri/src/audio/recorder.rs : struct Recorder
     - Utilise cpal pour ouvrir un stream d'entrée audio
     - Buffer pré-alloué (30 secondes max au départ, extensible)
     - Méthodes : start(), stop() -> Result<String, Error> (retourne le chemin du WAV créé)
     - Le WAV est sauvegardé dans {project_dir}/recordings/rec_{timestamp}.wav
   - Commandes Tauri :
     - list_input_devices() -> Result<Vec<AudioDeviceInfo>, String>
     - set_input_device(device_name: String) -> Result<(), String>
     - arm_track(track_id: u32, armed: bool) -> Result<(), String>
     - set_monitoring(enabled: bool) -> Result<(), String>
     - start_recording() -> Result<(), String>
     - stop_recording() -> Result<String, String> (retourne le chemin du WAV)

2. Frontend enregistrement :
   - Bouton Record (●) dans TransportBar, masqué par LevelGate level={4}
   - Bouton rouge, animation pulsante quand l'enregistrement est en cours
   - Workflow : sélectionner une piste → clic sur "Arm" (🔴 dans le header de la piste) → clic Record → clic Play → clic Stop → le clip apparaît
   - Indicateur de niveau d'entrée (mini VU-mètre) visible quand une piste est armée
   - Mets à jour transportStore et tracksStore

3. Import audio (Rust) :
   - Commande Tauri : import_audio_file(source_path: String) -> Result<SampleInfo, String>
     - Utilise symphonia pour décoder WAV, MP3, OGG, FLAC
     - Convertit en f32 48kHz si nécessaire
     - Copie le fichier décodé dans {project_dir}/samples/imported/
     - Retourne les infos (durée, waveform)
   - Frontend : le drag & drop de fichiers depuis l'explorateur du système vers la timeline
     - Utilise l'événement Tauri pour les fichiers droppés sur la fenêtre
     - Appelle import_audio_file, puis crée un clip sur la piste

4. Export audio (Rust) :
   - Crée src-tauri/src/project/export.rs : fonction export_project
     - Fait un rendu offline (plus rapide que le temps réel) de tout le projet
     - Boucle sample par sample du début à la fin, mixe toutes les pistes
     - Écrit le résultat en WAV 48kHz 32-bit ou WAV 16-bit
     - Pour le MP3 : utilise la crate lame-encoder ou encoder_mp3 (ajoute la dépendance)
     - Émet un événement de progression : "export://progress" { percent: f32 }
   - Commande Tauri : export_project(path: String, format: String, options: ExportOptions) -> Result<(), String>
   - Frontend :
     - Menu "Exporter" dans ProjectMenu
     - Modal d'export : choix du format (WAV / MP3), qualité MP3 (128/192/320 kbps), checkbox "Normaliser"
     - Barre de progression pendant l'export
     - À la fin : notification "Export terminé !" avec un bouton pour ouvrir le dossier

Teste : enregistre depuis le micro → le clip apparaît. Importe un MP3 → il apparaît comme clip. Exporte le projet en WAV → le fichier est lisible dans n'importe quel lecteur.
```

---

## Prompt 4.5 — Automation basique

```
Implémente l'automation basique telle que décrite dans @docs/SPEC_PHASE_4_STUDIO.md section 4.5.

1. Côté Rust :
   - Crée une structure d'automation dans la piste :
     - Struct AutomationLane : parameter (String), points (Vec<AutomationPoint>)
     - Struct AutomationPoint : time (f64 beats), value (f32 normalisé 0-1)
     - Chaque piste a un Vec<AutomationLane>
   - Fonction get_automated_value(lane, position) -> f32 : interpolation linéaire entre les deux points les plus proches
   - Dans le callback audio, pour chaque piste, lire les lanes d'automation et appliquer les valeurs aux paramètres (volume, pan, et paramètres d'effets)
   - Commandes Tauri :
     - add_automation_point(track_id: u32, parameter: String, time: f64, value: f32) -> Result<u32, String>
     - update_automation_point(point_id: u32, time: f64, value: f32) -> Result<(), String>
     - delete_automation_point(point_id: u32) -> Result<(), String>
     - get_automation_lane(track_id: u32, parameter: String) -> Result<Vec<AutomationPoint>, String>

2. Frontend :
   - src/components/timeline/AutomationLane.tsx : courbe superposée sur une piste dans la timeline
     - Affichée sous la piste (section dépliable)
     - La courbe est dessinée en SVG ou Canvas (ligne reliant les points)
     - Les points sont des cercles draggables
     - Clic dans le vide sur la lane → ajoute un point
     - Drag d'un point → déplace en X (temps) et Y (valeur)
     - Double-clic sur un point → supprime
   - src/components/timeline/AutomationSelector.tsx : dropdown pour choisir le paramètre à automatiser
     - Options : Volume, Pan, et pour chaque effet de la piste : "{effet}:{paramètre}"
   - Bouton "Show Automation" sur chaque Track header pour afficher/masquer la lane

3. L'automation est sauvegardée dans le projet .msp.

Teste : ajoute des points d'automation de volume sur une piste → pendant la lecture, le volume change progressivement.
```

---

## Prompt 4.6 — Undo/Redo et raccourcis clavier

```
Implémente le système d'undo/redo et les raccourcis clavier complets.

1. Undo/Redo :
   - Crée src/stores/historyStore.ts :
     - Pile undo (30 étapes max) et pile redo
     - Chaque entrée stocke un snapshot partiel : { type: "addClip" | "deleteClip" | "moveClip" | "addNote" | ..., before: data, after: data }
     - Actions : pushAction(action), undo(), redo()
   - Intègre dans les stores existants (tracksStore, projectStore) : chaque action modifiant des données appelle pushAction
   - Le undo restaure l'état précédent, le redo le suivant
   - Affiche un indicateur discret "Ctrl+Z pour annuler" après chaque action

2. Raccourcis clavier complets — crée src/hooks/useKeyboardShortcuts.ts :
   - Espace : toggle Play/Stop
   - R : toggle Record (niveau 4+)
   - M : toggle Mute sur la piste sélectionnée
   - S : toggle Solo sur la piste sélectionnée
   - Ctrl+S : Sauvegarder
   - Ctrl+Shift+S : Sauvegarder sous
   - Ctrl+Z : Undo
   - Ctrl+Y ou Ctrl+Shift+Z : Redo
   - Ctrl+D : Dupliquer le clip sélectionné
   - Delete / Backspace : Supprimer la sélection (clip ou notes)
   - Ctrl+A : Sélectionner tout (notes dans le piano roll, clips dans la timeline)
   - Ctrl+C / Ctrl+V : Copier/Coller
   - + / - : Zoom in/out sur la timeline
   - Les raccourcis du clavier virtuel (AZERTY) ne s'activent que quand le focus est sur le piano roll ou le clavier virtuel

3. Panneau de paramètres audio (dans les Settings) :
   - Sélection du périphérique de sortie audio
   - Sélection du périphérique d'entrée audio (pour l'enregistrement)
   - Buffer size : 128, 256, 512, 1024 (affiche la latence correspondante en ms)
   - Sample rate : 44100 ou 48000 Hz

Teste : fais quelques actions, Ctrl+Z annule, Ctrl+Y refait. Les raccourcis clavier fonctionnent tous.
```

---

## Validation Phase 4

- [ ] Le Mixer affiche toutes les pistes + master
- [ ] Les faders changent le volume (affiché en dB)
- [ ] Les VU-mètres s'animent en temps réel (30fps)
- [ ] Le panoramique déplace le son
- [ ] Mute/Solo fonctionnent depuis le mixer
- [ ] On peut ajouter/supprimer/bypass des effets
- [ ] Le Reverb ajoute de l'espace au son
- [ ] Le Delay produit des échos corrects
- [ ] L'EQ modifie les fréquences (courbe interactive)
- [ ] Le Compresseur réduit la dynamique (indicateur visible)
- [ ] L'enregistrement micro crée un clip
- [ ] L'import de fichiers audio fonctionne
- [ ] L'export WAV et MP3 fonctionne
- [ ] L'automation change les paramètres pendant la lecture
- [ ] Undo/Redo fonctionne
- [ ] Tous les raccourcis clavier fonctionnent
- [ ] Pas de craquements audio avec les effets
