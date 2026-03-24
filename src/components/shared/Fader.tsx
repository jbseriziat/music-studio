import { useRef, useCallback } from 'react';
import styles from './Fader.module.css';

interface FaderProps {
  /** Valeur courante en dB */
  valueDb: number;
  /** Minimum en dB (défaut : -60) */
  min?: number;
  /** Maximum en dB (défaut : 6) */
  max?: number;
  /** Hauteur visuelle du fader en px (défaut : 120) */
  height?: number;
  /** Callback quand la valeur change (en dB) */
  onChange: (db: number) => void;
}

// Convertit dB → position normalisée [0, 1] (0 = bas, 1 = haut)
function dbToNorm(db: number, min: number, max: number): number {
  if (!isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - min) / (max - min)));
}


/**
 * Fader vertical — drag haut/bas pour modifier le volume en dB.
 * Double-clic : reset à 0 dB.
 */
export function Fader({
  valueDb,
  min = -60,
  max = 6,
  height = 120,
  onChange,
}: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startDb: number } | null>(null);

  const norm = dbToNorm(valueDb, min, max);
  // Thumb position from top: 0% = max, 100% = min
  const thumbTop = (1 - norm) * (height - 16);

  // Zero dB marker position from top
  const zeroNorm = dbToNorm(0, min, max);
  const zeroTop = (1 - zeroNorm) * (height - 16);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startDb: valueDb };
    },
    [valueDb]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - e.clientY; // haut = augmente
      const range = max - min;
      const sensitivity = e.shiftKey ? 0.002 : 0.01;
      const delta = dy * sensitivity * range;
      const newDb = Math.min(max, Math.max(min, dragRef.current.startDb + delta));
      onChange(newDb);
    },
    [min, max, onChange]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onDoubleClick = useCallback(() => {
    onChange(0);
  }, [onChange]);

  const displayDb = isFinite(valueDb) ? valueDb.toFixed(1) : '-∞';

  return (
    <div className={styles.fader} style={{ height }}>
      <div
        className={styles.track}
        ref={trackRef}
        style={{ height: height - 16 }}
      >
        {/* Marqueur 0 dB */}
        <div
          className={styles.zeroMark}
          style={{ top: zeroTop }}
          title="0 dB"
        />
        {/* Remplissage actif */}
        <div
          className={styles.fill}
          style={{
            top: thumbTop + 8,
            bottom: 0,
          }}
        />
        {/* Thumb */}
        <div
          className={styles.thumb}
          style={{ top: thumbTop }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          title={`${displayDb} dB — double-clic pour reset à 0 dB`}
        />
      </div>
      <div className={styles.value}>{displayDb} dB</div>
    </div>
  );
}
