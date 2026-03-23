import { useFeatureLevel } from '../../hooks/useFeatureLevel';
import styles from './TimeRuler.module.css';

interface Props {
  totalSecs: number;
  pixelsPerSec: number;
  scrollLeft?: number;
  /** BPM courant — utilisé au niveau 2+ pour l'affichage mesures/temps. */
  bpm?: number;
}

// ─── Niveau 1 : règle en secondes ────────────────────────────────────────────

function SecondsRuler({
  totalSecs,
  pixelsPerSec,
}: {
  totalSecs: number;
  pixelsPerSec: number;
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
    </div>
  );
}

// ─── Niveau 2+ : règle en mesures / temps (format "1", "1.2", "2"…) ─────────

function BeatsRuler({
  totalSecs,
  pixelsPerSec,
  bpm,
}: {
  totalSecs: number;
  pixelsPerSec: number;
  bpm: number;
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
    </div>
  );
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function TimeRuler({ totalSecs, pixelsPerSec, bpm = 120 }: Props) {
  const { currentLevel } = useFeatureLevel();

  if (currentLevel >= 2) {
    return (
      <BeatsRuler totalSecs={totalSecs} pixelsPerSec={pixelsPerSec} bpm={bpm} />
    );
  }

  return <SecondsRuler totalSecs={totalSecs} pixelsPerSec={pixelsPerSec} />;
}
