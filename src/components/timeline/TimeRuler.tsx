import styles from './TimeRuler.module.css';

interface Props {
  totalSecs: number;
  pixelsPerSec: number;
  scrollLeft?: number;
}

export function TimeRuler({ totalSecs, pixelsPerSec }: Props) {
  // Niveau 1 : secondes. Niveau 2+ : mesures/beats (TODO)
  const step = 0.5; // 0.5 secondes
  const marks: number[] = [];
  for (let t = 0; t <= totalSecs; t += step) {
    marks.push(t);
  }

  return (
    <div className={styles.ruler} style={{ width: totalSecs * pixelsPerSec }}>
      {marks.map(t => {
        const isMainMark = t % 1 === 0;
        return (
          <div
            key={t}
            className={`${styles.mark} ${isMainMark ? styles.main : styles.sub}`}
            style={{ left: t * pixelsPerSec }}
          >
            {isMainMark && <span className={styles.label}>{t.toFixed(0)}s</span>}
          </div>
        );
      })}
    </div>
  );
}
