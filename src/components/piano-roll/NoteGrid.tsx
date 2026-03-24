import { useRef, useEffect, useCallback, useState } from 'react';
import styles from './NoteGrid.module.css';
import { usePianoRollStore } from '../../stores/pianoRollStore';
import type { PianoRollNote } from '../../stores/pianoRollStore';
import { NOTE_MIN, NOTE_MAX, NUM_NOTES, NOTE_HEIGHT } from './PianoKeys';

// ─── Constantes de layout ──────────────────────────────────────────────────────

/** Pixels par beat (zoom horizontal fixe pour l'instant). */
export const PIXELS_PER_BEAT = 80;

/** Nombre de beats affichés (longueur visible du clip). */
const VISIBLE_BEATS = 8;

/** Largeur totale de la grille. */
const GRID_WIDTH = VISIBLE_BEATS * PIXELS_PER_BEAT;

/** Hauteur totale de la grille. */
const GRID_HEIGHT = NUM_NOTES * NOTE_HEIGHT;

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const COLOR_BG_WHITE   = '#1e1e1e';
const COLOR_BG_BLACK   = '#181818';
const COLOR_GRID_BEAT  = '#444';
const COLOR_GRID_HALF  = '#2e2e2e';
const COLOR_NOTE_FILL  = '#9c27b0';
const COLOR_NOTE_SEL   = '#e040fb';
const COLOR_NOTE_STROKE = '#ce93d8';

const NOTE_NAMES_LOCAL = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function isBlackNote(note: number): boolean {
  return NOTE_NAMES_LOCAL[note % 12].includes('#');
}

// ─── Utilitaires de coordonnées ────────────────────────────────────────────────

function noteToY(note: number): number {
  // NOTE_MAX en haut (Y=0), NOTE_MIN en bas
  return (NOTE_MAX - note) * NOTE_HEIGHT;
}

function yToNote(y: number): number {
  return Math.round(NOTE_MAX - y / NOTE_HEIGHT);
}

function beatsToX(beats: number): number {
  return beats * PIXELS_PER_BEAT;
}

function xToBeats(x: number): number {
  return x / PIXELS_PER_BEAT;
}

function snapBeats(beats: number, quantize: number): number {
  return Math.round(beats / quantize) * quantize;
}

// ─── Types d'interaction ──────────────────────────────────────────────────────

type DragMode =
  | { type: 'none' }
  | { type: 'draw';   startNote: number; startBeat: number; noteId: number }
  | { type: 'move';   noteId: number; offsetBeat: number; offsetNote: number }
  | { type: 'resize'; noteId: number; startX: number; origDuration: number }
  | { type: 'select'; startX: number; startY: number; curX: number; curY: number };

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Grille de notes pour le piano roll — rendu Canvas 2D.
 * Interactions :
 *   - Clic + drag dans le vide → dessine une note
 *   - Clic sur une note → sélectionne
 *   - Drag d'une note → déplace (pitch + position)
 *   - Drag du bord droit d'une note → redimensionne
 *   - Double-clic sur une note → supprime
 *   - Double-clic dans le vide (ou Suppr) → supprime la sélection
 */
export function NoteGrid() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const dragRef    = useRef<DragMode>({ type: 'none' });
  const [, forceRender] = useState(0);

  const {
    notes, selectedNoteIds, quantize,
    addNote, updateNote, deleteNotes, setSelection,
  } = usePianoRollStore();

  // ── Rendu Canvas ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fond : lignes alternées blanc/noir
    for (let n = NOTE_MIN; n <= NOTE_MAX; n++) {
      const y = noteToY(n);
      ctx.fillStyle = isBlackNote(n) ? COLOR_BG_BLACK : COLOR_BG_WHITE;
      ctx.fillRect(0, y, GRID_WIDTH, NOTE_HEIGHT);
    }

    // Lignes verticales : demi-beat (fin) et beat (épais)
    for (let b = 0; b <= VISIBLE_BEATS; b += 0.25) {
      const x = beatsToX(b);
      const isBeat     = b === Math.floor(b);
      const isHalfBeat = (b * 2) === Math.floor(b * 2);
      ctx.strokeStyle = isBeat ? COLOR_GRID_BEAT : (isHalfBeat ? COLOR_GRID_HALF : 'transparent');
      ctx.lineWidth   = isBeat ? 1.5 : 0.5;
      if (ctx.strokeStyle !== 'transparent') {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GRID_HEIGHT);
        ctx.stroke();
      }
    }

    // Lignes horizontales : séparation entre les octaves (C de chaque octave)
    for (let n = NOTE_MIN; n <= NOTE_MAX; n++) {
      if (n % 12 === 0) {
        const y = noteToY(n) + NOTE_HEIGHT;
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(GRID_WIDTH, y);
        ctx.stroke();
      }
    }

    // Notes
    for (const note of notes) {
      const x  = beatsToX(note.startBeats);
      const y  = noteToY(note.note);
      const w  = Math.max(beatsToX(note.durationBeats) - 1, 2);
      const h  = NOTE_HEIGHT - 1;
      const selected = selectedNoteIds.has(note.id);

      ctx.fillStyle = selected ? COLOR_NOTE_SEL : COLOR_NOTE_FILL;
      // Légère transparence selon la vélocité
      ctx.globalAlpha = 0.5 + (note.velocity / 127) * 0.5;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = selected ? '#fff' : COLOR_NOTE_STROKE;
      ctx.lineWidth   = selected ? 1.5 : 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    // Rectangle de sélection (drag-select)
    const drag = dragRef.current;
    if (drag.type === 'select') {
      const sx = Math.min(drag.startX, drag.curX);
      const sy = Math.min(drag.startY, drag.curY);
      const sw = Math.abs(drag.curX - drag.startX);
      const sh = Math.abs(drag.curY - drag.startY);
      ctx.strokeStyle = '#e040fb';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }
  }, [notes, selectedNoteIds, forceRender]);

  // ── Helpers pour trouver la note sous le curseur ────────────────────────────

  const findNoteAt = useCallback((x: number, y: number): PianoRollNote | null => {
    const noteNum = yToNote(y);
    const beat    = xToBeats(x);
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (
        n.note === noteNum &&
        beat >= n.startBeats &&
        beat <= n.startBeats + n.durationBeats
      ) return n;
    }
    return null;
  }, [notes]);

  /** Retourne true si le curseur est sur le bord droit d'une note (resize). */
  const isOnRightEdge = useCallback((x: number, note: PianoRollNote): boolean => {
    const rightX = beatsToX(note.startBeats + note.durationBeats);
    return Math.abs(x - rightX) <= 6;
  }, []);

  // ── Événements souris ───────────────────────────────────────────────────────

  const getCanvasXY = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const [x, y] = getCanvasXY(e);
    const existingNote = findNoteAt(x, y);

    if (existingNote) {
      if (isOnRightEdge(x, existingNote)) {
        // Début du resize
        dragRef.current = {
          type: 'resize',
          noteId: existingNote.id,
          startX: x,
          origDuration: existingNote.durationBeats,
        };
      } else {
        // Début du déplacement
        setSelection([existingNote.id]);
        const offsetBeat = xToBeats(x) - existingNote.startBeats;
        const offsetNote = yToNote(y) - existingNote.note;
        dragRef.current = {
          type: 'move',
          noteId: existingNote.id,
          offsetBeat,
          offsetNote,
        };
      }
    } else {
      // Début du dessin d'une nouvelle note (ou drag-select si Shift)
      if (e.shiftKey) {
        dragRef.current = { type: 'select', startX: x, startY: y, curX: x, curY: y };
      } else {
        const startBeat = snapBeats(xToBeats(x), quantize);
        const startNote = yToNote(y);
        setSelection([]);
        // Créer immédiatement une note d'une durée minimale
        const tempId = Date.now(); // sera remplacé par l'id du store
        dragRef.current = {
          type: 'draw',
          startNote,
          startBeat,
          noteId: tempId,
        };
        addNote(startNote, startBeat, quantize, 100);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findNoteAt, isOnRightEdge, quantize, addNote, setSelection]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.type === 'none') return;
    const [x, y] = getCanvasXY(e);

    if (drag.type === 'draw') {
      // Trouver la note la plus récente (celle qu'on vient de créer)
      const latestNote = notes[notes.length - 1];
      if (!latestNote) return;
      const newDuration = Math.max(
        snapBeats(xToBeats(x) - latestNote.startBeats, quantize),
        quantize,
      );
      if (newDuration !== latestNote.durationBeats) {
        updateNote(latestNote.id, { durationBeats: newDuration });
      }
    } else if (drag.type === 'move') {
      const note = notes.find(n => n.id === drag.noteId);
      if (!note) return;
      const newStart = Math.max(0, snapBeats(xToBeats(x) - drag.offsetBeat, quantize));
      const newNote  = Math.min(NOTE_MAX, Math.max(NOTE_MIN, yToNote(y) - drag.offsetNote));
      if (newStart !== note.startBeats || newNote !== note.note) {
        updateNote(drag.noteId, { startBeats: newStart, note: newNote });
      }
    } else if (drag.type === 'resize') {
      const note = notes.find(n => n.id === drag.noteId);
      if (!note) return;
      const endBeat     = snapBeats(xToBeats(x), quantize);
      const newDuration = Math.max(quantize, endBeat - note.startBeats);
      if (newDuration !== note.durationBeats) {
        updateNote(drag.noteId, { durationBeats: newDuration });
      }
    } else if (drag.type === 'select') {
      dragRef.current = { ...drag, curX: x, curY: y };
      forceRender(n => n + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, quantize, updateNote]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.type === 'select') {
      // Finaliser la sélection rectangulaire
      const [x, y] = getCanvasXY(e);
      const x1 = Math.min(drag.startX, x);
      const x2 = Math.max(drag.startX, x);
      const y1 = Math.min(drag.startY, y);
      const y2 = Math.max(drag.startY, y);
      const selected = notes
        .filter(n => {
          const nx = beatsToX(n.startBeats);
          const ny = noteToY(n.note);
          return nx >= x1 && nx <= x2 && ny >= y1 && ny <= y2;
        })
        .map(n => n.id);
      setSelection(selected);
    }
    dragRef.current = { type: 'none' };
    forceRender(n => n + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, setSelection]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const [x, y] = getCanvasXY(e);
    const note = findNoteAt(x, y);
    if (note) {
      deleteNotes([note.id]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findNoteAt, deleteNotes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const store = usePianoRollStore.getState();

    if (e.key === 'Delete' || e.key === 'Backspace') {
      store.deleteSelectedNotes();
      e.preventDefault();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'a':
          store.selectAll();
          e.preventDefault();
          break;
        case 'c':
          store.copySelectedNotes();
          e.preventDefault();
          break;
        case 'v':
          store.pasteNotes();
          e.preventDefault();
          break;
        default:
          break;
      }
    }
  }, []);

  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        width={GRID_WIDTH}
        height={GRID_HEIGHT}
        className={styles.canvas}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label="Grille de notes MIDI"
      />
    </div>
  );
}
