import styles from './MidiClip.module.css';
import { usePianoRollStore } from '../../stores/pianoRollStore';
import type { PianoRollNote } from '../../stores/pianoRollStore';

// Gamme complète : 0 (C-1) à 127 (G9). Pour la mini vue, on restreint à la plage visible.
const NOTE_MIN_DISPLAY = 36;  // C2
const NOTE_MAX_DISPLAY = 84;  // C6
const NOTE_RANGE = NOTE_MAX_DISPLAY - NOTE_MIN_DISPLAY;

interface Props {
  /** ID Rust du clip MIDI (pour accéder aux notes dans pianoRollStore). */
  midiClipId: number;
  /** Largeur du clip en pixels (calculée depuis la durée et pixelsPerSec). */
  width: number;
  /** Couleur de la piste. */
  color: string;
  /** Rappelé quand l'utilisateur double-clique pour ouvrir le piano roll. */
  onDoubleClick: () => void;
}

/**
 * Visualisation d'un clip MIDI sur la timeline.
 * Affiche les notes en miniature sous forme de barres horizontales.
 * Double-clic → ouvre le piano roll pour ce clip.
 */
export function MidiClip({ midiClipId, width, color, onDoubleClick }: Props) {
  const { perClipNotes, clipId: activeClipId } = usePianoRollStore();
  const notes: PianoRollNote[] = perClipNotes[midiClipId] ?? [];
  const isActive = activeClipId === midiClipId;

  return (
    <div
      className={`${styles.midiClip} ${isActive ? styles.active : ''}`}
      style={{ width: Math.max(width, 60), borderColor: color }}
      onDoubleClick={onDoubleClick}
      title="Clip MIDI — double-clic pour éditer"
    >
      <span className={styles.label}>🎹</span>
      <div className={styles.miniNotes}>
        {notes.map(note => {
          const noteY = Math.max(0, Math.min(100,
            (1 - (note.note - NOTE_MIN_DISPLAY) / NOTE_RANGE) * 100
          ));
          const noteX = (note.startBeats / 4) * 100; // 4 beats = 100%
          const noteW = Math.max((note.durationBeats / 4) * 100, 1.5);
          return (
            <div
              key={note.id}
              className={styles.miniNote}
              style={{
                top: `${noteY}%`,
                left: `${noteX}%`,
                width: `${noteW}%`,
                background: color,
              }}
            />
          );
        })}
        {notes.length === 0 && (
          <span className={styles.emptyHint}>Vide — dbl-clic</span>
        )}
      </div>
    </div>
  );
}
