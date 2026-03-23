import { useCallback } from 'react';
import { useFeatureLevel } from '../../hooks/useFeatureLevel';
import styles from './TimeRuler.module.css';

interface Props {
  totalSecs: number;
  pixelsPerSec: number;
  scrollLeft?: number;
  /** BPM courant — utilisé au niveau 2+ pour l'affichage mesures/temps. */
  bpm?: number;
  /** Active la zone de boucle orange. */
  loopEnabled?: boolean;
  /** Début de la boucle en secondes. */
  loopStart?: number;
  /** Fin de la boucle en secondes. */
  loopEnd?: number;
  /** Appelé quand l'utilisateur déplace un marqueur de boucle. */
  onLoopChange?: (startSecs: number, endSecs: number) => void;
}

// ─── Niveau 1 : règle en secondes ────────────────────────────────────────────

function SecondsRuler({
  totalSecs,
  pixelsPerSec,
  children,
}: {
  totalSecs: number;
  pixelsPerSec: number;
  children?: React.ReactNode;
}) {
  const step = 0.5;
  const marks: number[] = [];
  for (let t = 0; t <= totalSecs; t += step) marks.push(t);

  return (
    <div className={styles.ruler} style={{ width: totalSecs * pixelsPerSec }}>
      {marks.map((t) => {
        const isMain = t % 1 === 0;
        return (
          <div
            key={t}
            className={`${styles.mark} ${isMain ? styles.main : styles.sub}`}
            style={{ left: t * pixelsPerSec }}
          >
            {isMain && <span className={styles.label}>{t.toFixed(0)}s</span>}
          </div>
        );
      })}
      {children}
    </div>
  );
}

// ─── Niveau 2+ : règle en mesures / temps (format "1", "1.2", "2"…) ─────────

function BeatsRuler({
  totalSecs,
  pixelsPerSec,
  bpm,
  children,
}: {
  totalSecs: number;
  pixelsPerSec: number;
  bpm: number;
  children?: React.ReactNode;
}) {
  const secsPerBeat = 60.0 / bpm;
  const totalBeats = Math.ceil(totalSecs / secsPerBeat) + 1;

  const marks: { beatIndex: number; isBar: boolean; label: string }[] = [];
  for (let b = 0; b <= totalBeats; b++) {
    const bar = Math.floor(b / 4) + 1;
    const beatInBar = (b % 4) + 1;
    const isBar = beatInBar === 1;
    marks.push({
      beatIndex: b,
      isBar,
      // Barres : "1", "2", "3"… — autres temps : "1.2", "1.3", "1.4"
      label: isBar ? `${bar}` : `${bar}.${beatInBar}`,
    });
  }

  return (
    <div className={styles.ruler} style={{ width: totalSecs * pixelsPerSec }}>
      {marks.map(({ beatIndex, isBar, label }) => {
        const x = beatIndex * secsPerBeat * pixelsPerSec;
        // N'afficher le label que sur les barres et le 3e temps (pour éviter la surcharge)
        const showLabel = isBar || beatIndex % 4 === 2;
        return (
          <div
            key={beatIndex}
            className={`${styles.mark} ${isBar ? styles.main : styles.sub}`}
            style={{ left: x }}
          >
            {showLabel && <span className={styles.label}>{label}</span>}
          </div>
        );
      })}
      {children}
    </div>
  );
}

// ─── Overlay zone de boucle ───────────────────────────────────────────────────

function LoopOverlay({
  loopStart,
  loopEnd,
  pixelsPerSec,
  totalSecs,
  onLoopChange,
}: {
  loopStart: number;
  loopEnd: number;
  pixelsPerSec: number;
  totalSecs: number;
  onLoopChange?: (startSecs: number, endSecs: number) => void;
}) {
  const left  = Math.max(0, loopStart) * pixelsPerSec;
  const width = Math.max(0, loopEnd - loopStart) * pixelsPerSec;

  const handleDragMarker = useCallback(
    (isStart: boolean) => (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const origVal = isStart ? loopStart : loopEnd;

      const onMove = (me: MouseEvent) => {
        const delta = (me.clientX - startX) / pixelsPerSec;
        const newVal = Math.max(0, Math.min(totalSecs, origVal + delta));
        if (isStart) {
          onLoopChange?.(Math.min(newVal, loopEnd - 0.1), loopEnd);
        } else {
          onLoopChange?.(loopStart, Math.max(newVal, loopStart + 0.1));
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [loopStart, loopEnd, pixelsPerSec, totalSecs, onLoopChange],
  );

  return (
    <>
      <div className={styles.loopZone} style={{ left, width }} />
      <div
        className={styles.loopMarker}
        style={{ left }}
        onMouseDown={handleDragMarker(true)}
        title="Début de boucle"
      />
      <div
        className={styles.loopMarker}
        style={{ left: left + width }}
        onMouseDown={handleDragMarker(false)}
        title="Fin de boucle"
      />
    </>
  );
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function TimeRuler({
  totalSecs,
  pixelsPerSec,
  bpm = 120,
  loopEnabled = false,
  loopStart = 0,
  loopEnd = 8,
  onLoopChange,
}: Props) {
  const { currentLevel } = useFeatureLevel();

  const loopOverlay = loopEnabled ? (
    <LoopOverlay
      loopStart={loopStart}
      loopEnd={loopEnd}
      pixelsPerSec={pixelsPerSec}
      totalSecs={totalSecs}
      onLoopChange={onLoopChange}
    />
  ) : null;

  if (currentLevel >= 2) {
    return (
      <BeatsRuler totalSecs={totalSecs} pixelsPerSec={pixelsPerSec} bpm={bpm}>
        {loopOverlay}
      </BeatsRuler>
    );
  }

  return (
    <SecondsRuler totalSecs={totalSecs} pixelsPerSec={pixelsPerSec}>
      {loopOverlay}
    </SecondsRuler>
  );
}
