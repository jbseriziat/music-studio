# 📋 Music Studio — Guide d'utilisation avec Claude Code

## Vue d'ensemble des documents

| Fichier | Contenu | Quand l'utiliser |
|---|---|---|
| `SPEC_PHASE_0_ARCHITECTURE.md` | Stack technique, système de niveaux, structure du projet, contrat IPC, conventions | **Toujours en premier** — c'est le socle de tout |
| `SPEC_PHASE_1_DECOUVERTE.md` | Profils, Sound Pads, Timeline simple, Transport, Sample Browser, moteur audio de base | Premier prompt de développement |
| `SPEC_PHASE_2_PETIT_PRODUCTEUR.md` | Drum Rack, Step Sequencer, BPM, Loop, Métronome | Après validation de la Phase 1 |
| `SPEC_PHASE_3_MELODISTE.md` | Piano Roll, Synthé simple, MIDI, Clavier virtuel | Après validation de la Phase 2 |
| `SPEC_PHASE_4_STUDIO.md` | Mixer, Effets (Reverb/Delay/EQ/Comp), Recording, Import/Export, Automation | Après validation de la Phase 3 |
| `SPEC_PHASE_5_PRODUCTEUR_PRO.md` | Synthé avancé, Mastering, Bus/Send, Sidechain, Workflow pro | Après validation de la Phase 4 |

---

## Stratégie de prompting pour Claude Code

### Règle d'or : ne jamais tout demander d'un coup

Claude Code fonctionne mieux quand on lui donne des tâches ciblées. Voici comment découper le travail :

### Étape 0 — Initialisation du projet

```
Prompt Claude Code :

"Initialise un projet Tauri v2 avec React + TypeScript pour le frontend
et Rust pour le backend. Le projet s'appelle 'music-studio'.
Voici les spécifications d'architecture : [coller SPEC_PHASE_0_ARCHITECTURE.md]

Pour l'instant, crée juste la structure de fichiers, les dépendances
(Cargo.toml + package.json), et un Hello World qui compile et s'ouvre
sur Linux et Windows. Assure-toi que le build Tauri fonctionne."
```

### Phase 1 — Découpage en sous-tâches

Ne donne pas toute la Phase 1 d'un coup. Découpe :

```
Tâche 1.1 : "Implémente le système de profils et de niveaux.
Voici les specs : [coller section 1.1 de SPEC_PHASE_1]
Le store Zustand, les composants ProfileSelector, ProfileCreator,
et le wrapper LevelGate."

Tâche 1.2 : "Implémente le moteur audio Rust de base.
Voici les specs : [coller section 1.6 de SPEC_PHASE_1]
Initialisation cpal, thread audio, lecture d'un sample WAV."

Tâche 1.3 : "Implémente la grille de Sound Pads.
Voici les specs : [coller section 1.2]
Les pads doivent appeler le moteur audio via invoke()."

Tâche 1.4 : "Implémente le Sample Browser.
Voici les specs : [coller section 1.5]"

Tâche 1.5 : "Implémente la Timeline et le Transport.
Voici les specs : [coller sections 1.3 + 1.4]"

Tâche 1.6 : "Implémente la sauvegarde/chargement de projet.
Voici les specs : [coller section 1.7]"
```

### Relecture et correction

Après chaque tâche :
```
"Le build compile mais [décrire le problème].
Voici le code actuel de [fichier] : [coller le code].
Voici l'erreur : [coller l'erreur].
Corrige le problème en respectant les specs."
```

### Passage à la phase suivante

```
"La Phase 1 est validée. Maintenant, implémente la Phase 2.
Voici les specs complètes : [coller SPEC_PHASE_2]

Commence par la tâche 2.1 : le Drum Rack.
Le moteur audio existant est dans src-tauri/src/audio/engine.rs.
Il faut l'étendre pour supporter le nouveau type de piste DrumRack."
```

---

## Conseils techniques pour le vibecoding

### Quand quelque chose ne marche pas

1. **Erreur de compilation Rust** → Colle l'erreur complète à Claude Code. Le Rust a des messages d'erreur très explicites.
2. **Pas de son** → Vérifie que cpal détecte un périphérique. Ajoute des `println!` dans le callback audio.
3. **Craquements audio** → Le buffer est trop petit ou le thread audio est bloqué. Augmente le buffer à 1024.
4. **L'IPC ne marche pas** → Vérifie que la commande Tauri est bien déclarée dans `main.rs` avec `.invoke_handler(tauri::generate_handler![...])`.

### Où trouver les samples gratuits

L'application a besoin de samples embarqués. Sources légales et gratuites :
- **Freesound.org** — Sons Creative Commons (vérifier la licence de chaque son)
- **SampleSwap.org** — Bibliothèque gratuite
- **99sounds.org** — Packs gratuits de haute qualité
- **LMMS** (logiciel libre) — Contient des samples redistribuables

Convertir tous les samples en WAV 48kHz 16-bit avant de les inclure.

### Tester l'audio sur Linux

- Vérifier que PulseAudio ou PipeWire est actif
- `pactl list short sinks` pour voir les sorties audio
- `aplay -l` pour voir les périphériques ALSA
- Si cpal ne trouve pas de périphérique, installer `libasound2-dev` (Ubuntu)

### Tester l'audio sur Windows

- cpal utilise WASAPI par défaut (bon pour la latence)
- Pour une latence encore plus basse, envisager le support ASIO (nécessite le SDK ASIO)

---

## Ordre de priorité si tu manques de temps

Si tu ne veux pas tout développer d'un coup, voici ce qui est **essentiel** vs **optionnel** par phase :

### Phase 1 — Tout est essentiel (c'est la base)

### Phase 2
- ✅ Essentiel : Drum Rack, Step Sequencer, BPM
- ⭐ Important : Loop, Métronome
- 💡 Optionnel : Kits prédéfinis multiples

### Phase 3
- ✅ Essentiel : Piano Roll, Synthé basique (1 oscillateur + ADSR + filtre)
- ⭐ Important : Presets, Clavier virtuel
- 💡 Optionnel : Support MIDI externe (peut venir plus tard)

### Phase 4
- ✅ Essentiel : Mixer (faders + VU-mètres), Reverb, EQ
- ⭐ Important : Delay, Compresseur, Export WAV
- 💡 Optionnel : Enregistrement micro, Automation, Export MP3

### Phase 5
- ✅ Essentiel : Limiteur master, Mesure LUFS
- ⭐ Important : Double oscillateur, LFO, EQ master
- 💡 Optionnel : Sidechain, Bus d'effets, Multiband compressor, Groupes de pistes
