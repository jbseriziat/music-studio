import { useEffect, useCallback } from 'react';
import styles from './PianoRoll.module.css';
import { usePianoRollStore } from '../../stores/pianoRollStore';
import { PianoKeys, PIANO_KEYS_WIDTH } from './PianoKeys';
import { NoteGrid, PIXELS_PER_BEAT } from './NoteGrid';
import { VelocityLane } from './VelocityLane';
import { QuantizeSelector } from './QuantizeSelector';

/** Nombre de beats visibles (doit correspondre à VISIBLE_BEATS dans NoteGrid). */
const VISIBLE_BEATS = 8;
const GRID_WIDTH = VISIBLE_BEATS * PIXELS_PER_BEAT;

/**
 * Piano Roll — éditeur de notes MIDI.
 * Affiché en overlay modal quand pianoRollStore.isOpen = true.
 */
export function PianoRoll() {
  const { isOpen, close, deleteSelectedNotes, trackId } = usePianoRollStore();

  // Raccourci clavier : Suppr → supprime les notes sélectionnées
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Seulement si le focus n'est pas dans un input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      e.preventDefault();
      deleteSelectedNotes();
    }
    if (e.key === 'Escape') {
      close();
    }
  }, [isOpen, deleteSelectedNotes, close]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <button
            className={styles.backBtn}
            onClick={close}
            aria-label="Retour à la timeline"
            title="Retour à la timeline (Échap)"
          >← Timeline</button>
          <span className={styles.icon}>🎹</span>
          <h3 className={styles.title}>Piano Roll</h3>
          {trackId !== null && (
            <span className={styles.trackBadge}>Piste #{trackId}</span>
          )}
          <div className={styles.spacer} />
          <QuantizeSelector />
          <button
            className={styles.closeBtn}
            onClick={close}
            aria-label="Fermer le piano roll"
            title="Fermer (Échap)"
          >✕</button>
        </div>

        {/* ── Corps : clavier + grille ─────────────────────────────────────── */}
        <div className={styles.body}>
          {/* Scrollable area contenant clavier + grille */}
          <div className={styles.scrollArea}>
            <div className={styles.row}>
              <PianoKeys />
              <NoteGrid />
            </div>
          </div>
          {/* Panneau de vélocité en bas */}
          <div className={styles.velocityWrapper}>
            <VelocityLane gridWidth={GRID_WIDTH + PIANO_KEYS_WIDTH} />
          </div>
        </div>

        {/* ── Pied de page ─────────────────────────────────────────────────── */}
        <p className={styles.hint}>
          Clic + drag = dessiner · Drag note = déplacer · Bord droit = redimensionner ·
          Double-clic = supprimer · Shift+drag = sélection · Suppr = effacer sélection
        </p>
      </div>
    </div>
  );
}
