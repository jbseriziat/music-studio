import { useEffect, useCallback, useRef } from 'react';
import styles from './SynthPanel.module.css';
import { LevelGate } from '../shared/LevelGate';
import { OscillatorUI } from './OscillatorUI';
import { EnvelopeUI } from './EnvelopeUI';
import { FilterUI } from './FilterUI';
import { PresetSelector } from './PresetSelector';
import { Knob } from '../shared/Knob';
import { useSynthStore } from '../../stores/synthStore';

/**
 * Panneau Synthétiseur (niveau 3+).
 * Initialise le synthé au montage et expose tous les contrôles.
 * Clavier virtuel intégré (2 octaves, do–si).
 */
export function SynthPanel() {
  const { init, params, setParam, noteOn, noteOff, isInitializing, trackId } = useSynthStore();

  // Initialise le synthé la première fois
  useEffect(() => {
    init();
  }, [init]);

  const handleVolume = useCallback((v: number) => setParam('volume', v), [setParam]);

  // ── Clavier virtuel intégré ──────────────────────────────────────────────────
  // 2 octaves : do3 (note 48) → si4 (note 71)
  const OCTAVE_START = 48;
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const KEYS: { note: number; isBlack: boolean; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const note = OCTAVE_START + i;
    const name = NOTE_NAMES[i % 12];
    KEYS.push({ note, isBlack: name.includes('#'), label: name });
  }

  const activeNotes = useRef<Set<number>>(new Set());

  const triggerNoteOn = useCallback((note: number) => {
    if (activeNotes.current.has(note)) return;
    activeNotes.current.add(note);
    noteOn(note, 100);
  }, [noteOn]);

  const triggerNoteOff = useCallback((note: number) => {
    activeNotes.current.delete(note);
    noteOff(note);
  }, [noteOff]);

  // ── Clavier AZERTY (mappings) ────────────────────────────────────────────────
  const KEY_MAP: Record<string, number> = {
    'q': 48, 'z': 49, 's': 50, 'e': 51, 'd': 52, 'f': 53,
    'g': 54, 'h': 55, 'j': 56, 'k': 57, 'l': 58, 'm': 59,
    'w': 60, 'x': 61, 'c': 62, 'v': 63, 'b': 64, 'n': 65,
    ',': 66, ';': 67, ':': 68, '=': 69,
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const note = KEY_MAP[e.key.toLowerCase()];
      if (note !== undefined) {
        e.preventDefault();
        triggerNoteOn(note);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const note = KEY_MAP[e.key.toLowerCase()];
      if (note !== undefined) triggerNoteOff(note);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerNoteOn, triggerNoteOff]);

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

        {/* Clavier virtuel */}
        <div className={styles.keyboard} aria-label="Clavier virtuel">
          {KEYS.map(key => (
            <button
              key={key.note}
              className={`${styles.key} ${key.isBlack ? styles.blackKey : styles.whiteKey}`}
              onMouseDown={() => triggerNoteOn(key.note)}
              onMouseUp={() => triggerNoteOff(key.note)}
              onMouseLeave={() => triggerNoteOff(key.note)}
              onTouchStart={e => { e.preventDefault(); triggerNoteOn(key.note); }}
              onTouchEnd={() => triggerNoteOff(key.note)}
              aria-label={`${key.label} (note ${key.note})`}
              title={`${key.label} (note ${key.note})`}
            />
          ))}
        </div>

        <p className={styles.keyboardHint}>
          Clavier : Q-Z-S-E-D-F… (AZERTY) · Shift = précision knob · Double-clic = reset
        </p>
      </div>
    </LevelGate>
  );
}
