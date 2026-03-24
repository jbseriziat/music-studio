import { useState, useEffect, useCallback, useRef } from 'react';
import { useSynthStore } from '../stores/synthStore';

/**
 * Mapping clavier AZERTY → numéro de note MIDI.
 * Octave 3 (do3 = 48) sur la rangée du bas, octave 4 (do4 = 60) sur la rangée du haut.
 */
export const KEYBOARD_NOTE_MAP: Record<string, number> = {
  // Rangée inférieure : do3 (48) → sol#3 (56)
  'q': 48,  // C3
  'z': 49,  // C#3
  's': 50,  // D3
  'e': 51,  // D#3
  'd': 52,  // E3
  'f': 53,  // F3
  'g': 54,  // F#3
  'h': 55,  // G3
  'j': 56,  // G#3
  'k': 57,  // A3
  'l': 58,  // A#3
  'm': 59,  // B3
  // Rangée supérieure : do4 (60) → …
  'w': 60,  // C4
  'x': 61,  // C#4
  'c': 62,  // D4
  'v': 63,  // D#4
  'b': 64,  // E4
  'n': 65,  // F4
  ',': 66,  // F#4
  ';': 67,  // G4
  ':': 68,  // G#4
  '=': 69,  // A4
};

/**
 * Hook de mapping clavier AZERTY → MIDI.
 *
 * - Écoute keydown / keyup sur window
 * - Appelle noteOn / noteOff du synthStore
 * - Retourne `pressedNotes` pour l'illumination visuelle des touches
 *
 * @param enabled Activer/désactiver les écouteurs (false quand un champ de saisie a le focus)
 */
export function useKeyboardMidi(enabled = true) {
  const { noteOn, noteOff } = useSynthStore();
  const [pressedNotes, setPressedNotes] = useState<Set<number>>(new Set());
  // Ref pour éviter les doublons sans re-render inutile
  const activeRef = useRef<Set<number>>(new Set());

  const triggerNoteOn = useCallback(
    (note: number) => {
      if (activeRef.current.has(note)) return;
      activeRef.current.add(note);
      setPressedNotes(new Set(activeRef.current));
      noteOn(note, 100);
    },
    [noteOn],
  );

  const triggerNoteOff = useCallback(
    (note: number) => {
      if (!activeRef.current.has(note)) return;
      activeRef.current.delete(note);
      setPressedNotes(new Set(activeRef.current));
      noteOff(note);
    },
    [noteOff],
  );

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignorer les répétitions, les modificateurs, et les saisies dans des inputs
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      const note = KEYBOARD_NOTE_MAP[e.key.toLowerCase()];
      if (note !== undefined) {
        e.preventDefault();
        triggerNoteOn(note);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const note = KEYBOARD_NOTE_MAP[e.key.toLowerCase()];
      if (note !== undefined) triggerNoteOff(note);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled, triggerNoteOn, triggerNoteOff]);

  return { pressedNotes, triggerNoteOn, triggerNoteOff };
}
