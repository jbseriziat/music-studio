import { useRef, useEffect, useCallback } from 'react';
import styles from './VelocityLane.module.css';
import { usePianoRollStore } from '../../stores/pianoRollStore';
import { PIXELS_PER_BEAT } from './NoteGrid';
import { beatsToX } from './noteGridUtils';

/** Hauteur du panneau de vélocité en pixels. */
export const VELOCITY_LANE_HEIGHT = 60;

/**
 * Panneau de vélocité sous la grille de notes.
 * Affiche les vélocités sous forme de barres verticales.
 * Clic + drag sur une barre → ajuste la vélocité.
 */
export function VelocityLane({ gridWidth }: { gridWidth: number }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const dragging   = useRef<number | null>(null); // note id en cours de drag

  const { notes, updateNote } = usePianoRollStore();

  // ── Rendu ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, gridWidth, VELOCITY_LANE_HEIGHT);

    // Fond
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, gridWidth, VELOCITY_LANE_HEIGHT);

    // Ligne de référence mi-vélocité (64/127 ≈ 50%)
    ctx.strokeStyle = '#333';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, VELOCITY_LANE_HEIGHT / 2);
    ctx.lineTo(gridWidth, VELOCITY_LANE_HEIGHT / 2);
    ctx.stroke();

    // Barres
    for (const note of notes) {
      const x    = beatsToX(note.startBeats);
      const barH = Math.round((note.velocity / 127) * (VELOCITY_LANE_HEIGHT - 4));
      const y    = VELOCITY_LANE_HEIGHT - barH - 2;
      ctx.fillStyle = '#9c27b0';
      ctx.fillRect(x + 1, y, Math.max(PIXELS_PER_BEAT * 0.15, 4), barH);
    }
  }, [notes, gridWidth]);

  // ── Interactions ───────────────────────────────────────────────────────────

  const findNoteAt = useCallback((x: number): typeof notes[0] | null => {
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const nx = beatsToX(n.startBeats);
      if (x >= nx && x <= nx + PIXELS_PER_BEAT * 0.25) return n;
    }
    return null;
  }, [notes]);

  const setVelocityFromY = useCallback((noteId: number, y: number) => {
    const velocity = Math.min(127, Math.max(1,
      Math.round(((VELOCITY_LANE_HEIGHT - y) / VELOCITY_LANE_HEIGHT) * 127)
    ));
    updateNote(noteId, { velocity });
  }, [updateNote]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const note = findNoteAt(x);
    if (note) {
      dragging.current = note.id;
      setVelocityFromY(note.id, y);
    }
  }, [findNoteAt, setVelocityFromY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging.current === null) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setVelocityFromY(dragging.current, y);
  }, [setVelocityFromY]);

  const handleMouseUp = useCallback(() => {
    dragging.current = null;
  }, []);

  return (
    <div className={styles.lane}>
      <div className={styles.label}>vel</div>
      <canvas
        ref={canvasRef}
        width={gridWidth}
        height={VELOCITY_LANE_HEIGHT}
        className={styles.canvas}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}
