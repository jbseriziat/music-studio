import { useState, useCallback } from 'react';
import { useSynthStore } from '../../stores/synthStore';
import styles from './VirtualKeyboard.module.css';

// ─── Données des touches ──────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface KeyDef {
  note: number;
  isBlack: boolean;
  label: string;
}

function buildKeys(octaveStart: number, octaveCount: number): KeyDef[] {
  const keys: KeyDef[] = [];
  for (let i = 0; i < 12 * octaveCount; i++) {
    const note = octaveStart + i;
    const name = NOTE_NAMES[i % 12];
    keys.push({ note, isBlack: name.includes('#'), label: name });
  }
  return keys;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface VirtualKeyboardProps {
  /** Notes actuellement enfoncées via le clavier physique (illumination). */
  pressedNotes?: ReadonlySet<number>;
  /** Numéro MIDI de la première note affichée. Par défaut 48 (C3). */
  octaveStart?: number;
  /** Nombre d'octaves affichées. Par défaut 2. */
  octaveCount?: number;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Clavier virtuel 2 octaves.
 *
 * - Les touches s'illuminent selon `pressedNotes` (clavier physique AZERTY)
 *   ou quand on les clique/touche avec la souris.
 * - Le son est déclenché via `useSynthStore.noteOn / noteOff`.
 */
export function VirtualKeyboard({
  pressedNotes = new Set<number>(),
  octaveStart = 48,
  octaveCount = 2,
}: VirtualKeyboardProps) {
  const { noteOn, noteOff } = useSynthStore();
  // Notes enfoncées via souris/toucher
  const [mouseNotes, setMouseNotes] = useState<Set<number>>(new Set());

  const handleMouseDown = useCallback(
    (note: number) => {
      setMouseNotes((prev) => {
        const next = new Set(prev);
        next.add(note);
        return next;
      });
      noteOn(note, 100);
    },
    [noteOn],
  );

  const handleMouseUp = useCallback(
    (note: number) => {
      setMouseNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
      noteOff(note);
    },
    [noteOff],
  );

  const handleMouseLeave = useCallback(
    (note: number) => {
      if (mouseNotes.has(note)) {
        setMouseNotes((prev) => {
          const next = new Set(prev);
          next.delete(note);
          return next;
        });
        noteOff(note);
      }
    },
    [mouseNotes, noteOff],
  );

  const keys = buildKeys(octaveStart, octaveCount);

  return (
    <>
      <div className={styles.keyboard} aria-label="Clavier virtuel">
        {keys.map((key) => {
          const isActive = pressedNotes.has(key.note) || mouseNotes.has(key.note);
          return (
            <button
              key={key.note}
              className={[
                styles.key,
                key.isBlack ? styles.blackKey : styles.whiteKey,
                isActive ? styles.active : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={() => handleMouseDown(key.note)}
              onMouseUp={() => handleMouseUp(key.note)}
              onMouseLeave={() => handleMouseLeave(key.note)}
              onTouchStart={(e) => {
                e.preventDefault();
                handleMouseDown(key.note);
              }}
              onTouchEnd={() => handleMouseUp(key.note)}
              aria-label={`${key.label} (note ${key.note})`}
              title={`${key.label} (note ${key.note})`}
            />
          );
        })}
      </div>
      <p className={styles.hint}>
        Clavier : Q-Z-S-E-D-F-G-H-J-K-L-M … W-X-C-V-B-N-,-;-:-= (AZERTY) · Clic = jouer
      </p>
    </>
  );
}
