import { useEffect, useCallback } from 'react';
import styles from './SynthPanel.module.css';
import { LevelGate } from '../shared/LevelGate';
import { OscillatorUI } from './OscillatorUI';
import { EnvelopeUI } from './EnvelopeUI';
import { FilterUI } from './FilterUI';
import { PresetSelector } from './PresetSelector';
import { Knob } from '../shared/Knob';
import { VirtualKeyboard } from '../piano-roll/VirtualKeyboard';
import { useSynthStore } from '../../stores/synthStore';
import { usePianoRollStore } from '../../stores/pianoRollStore';
import { useKeyboardMidi } from '../../hooks/useKeyboardMidi';

/**
 * Panneau Synthétiseur (niveau 3+).
 * Initialise le synthé au montage et expose tous les contrôles.
 * Le clavier AZERTY est géré via useKeyboardMidi.
 * Le clavier visuel est rendu par VirtualKeyboard.
 */
export function SynthPanel() {
  const { init, params, setParam, isInitializing, trackId } = useSynthStore();
  const { openForTrack } = usePianoRollStore();

  const handleOpenPianoRoll = useCallback(() => {
    if (trackId !== null) openForTrack(trackId);
  }, [trackId, openForTrack]);

  // Initialise le synthé la première fois
  useEffect(() => {
    init();
  }, [init]);

  // Clavier AZERTY → MIDI (retourne pressedNotes pour illuminer les touches visuelles)
  const { pressedNotes } = useKeyboardMidi(true);

  const handleVolume = useCallback((v: number) => setParam('volume', v), [setParam]);

  if (isInitializing) {
    return (
      <LevelGate level={3}>
        <div className={styles.panel}>
          <div className={styles.loading}>Initialisation du synthétiseur…</div>
        </div>
      </LevelGate>
    );
  }

  return (
    <LevelGate level={3}>
      <div className={styles.panel}>
        {/* En-tête */}
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <span className={styles.icon}>🎹</span>
            <h2 className={styles.title}>Synthétiseur</h2>
            {trackId !== null && (
              <span className={styles.trackBadge}>Piste #{trackId}</span>
            )}
            <button
              className={styles.pianoRollBtn}
              onClick={handleOpenPianoRoll}
              disabled={trackId === null}
              title="Ouvrir le Piano Roll"
              aria-label="Ouvrir le Piano Roll"
            >
              🎼 Piano Roll
            </button>
          </div>
          <PresetSelector />
        </div>

        {/* Contenu principal */}
        <div className={styles.content}>
          {/* Colonne gauche : Oscillateur */}
          <div className={styles.column}>
            <OscillatorUI />
          </div>

          {/* Colonne milieu : Enveloppe */}
          <div className={styles.column}>
            <EnvelopeUI />
          </div>

          {/* Colonne droite : Filtre + Volume */}
          <div className={styles.column}>
            <FilterUI />
            <div className={styles.volumeRow}>
              <Knob
                label="Volume"
                value={params.volume}
                min={0}
                max={2}
                defaultValue={0.5}
                decimals={2}
                size={46}
                onChange={handleVolume}
              />
            </div>
          </div>
        </div>

        {/* Clavier virtuel — illuminé selon les touches AZERTY enfoncées */}
        <VirtualKeyboard pressedNotes={pressedNotes} octaveStart={48} octaveCount={2} />
      </div>
    </LevelGate>
  );
}
