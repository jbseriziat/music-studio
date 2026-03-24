import { useCallback } from 'react';
import styles from './PianoKeys.module.css';
import { usePianoRollStore } from '../../stores/pianoRollStore';

/** Largeur du clavier vertical en pixels. */
export const PIANO_KEYS_WIDTH = 52;

/** Hauteur d'une note en pixels (doit correspondre à NoteGrid). */
export const NOTE_HEIGHT = 10;

/** Nombre total de notes affichées (C2–B6 = 5 octaves = 60 notes, note 36–95). */
export const NOTE_MIN = 24;   // C1
export const NOTE_MAX = 107;  // B7
export const NUM_NOTES = NOTE_MAX - NOTE_MIN + 1;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function isBlack(note: number): boolean {
  return NOTE_NAMES[note % 12].includes('#');
}

function noteName(note: number): string {
  const name = NOTE_NAMES[note % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
}

/**
 * Clavier de piano vertical (affiché à gauche du piano roll).
 * Clic sur une touche → aperçu sonore via note_on / note_off.
 */
export function PianoKeys() {
  const { previewNoteOn, previewNoteOff } = usePianoRollStore();

  const handleMouseDown = useCallback((note: number) => {
    previewNoteOn(note);
  }, [previewNoteOn]);

  const handleMouseUp = useCallback((note: number) => {
    previewNoteOff(note);
  }, [previewNoteOff]);

  const handleMouseLeave = useCallback((note: number) => {
    previewNoteOff(note);
  }, [previewNoteOff]);

  // Les notes vont de NOTE_MAX (en haut, Y=0) à NOTE_MIN (en bas).
  const keys = [];
  for (let n = NOTE_MAX; n >= NOTE_MIN; n--) {
    const black = isBlack(n);
    const isC = (n % 12 === 0);
    const label = isC ? noteName(n) : '';

    keys.push(
      <button
        key={n}
        className={`${styles.key} ${black ? styles.black : styles.white}`}
        style={{ height: NOTE_HEIGHT }}
        onMouseDown={() => handleMouseDown(n)}
        onMouseUp={() => handleMouseUp(n)}
        onMouseLeave={() => handleMouseLeave(n)}
        onTouchStart={e => { e.preventDefault(); handleMouseDown(n); }}
        onTouchEnd={() => handleMouseUp(n)}
        aria-label={noteName(n)}
        title={noteName(n)}
      >
        {label && <span className={styles.label}>{label}</span>}
      </button>
    );
  }

  return (
    <div
      className={styles.pianoKeys}
      style={{ width: PIANO_KEYS_WIDTH, height: NUM_NOTES * NOTE_HEIGHT }}
    >
      {keys}
    </div>
  );
}
