import { useRef } from 'react';
import type { MeterData } from '../../stores/mixerStore';
import { LINEAR_TO_DB } from '../../stores/mixerStore';
import styles from './VuMeter.module.css';

interface VuMeterProps {
  meter: MeterData;
  /** Hauteur en px (défaut : 80) */
  height?: number;
}

// Convertit un niveau linéaire en position normalisée [0, 1] sur la barre (0 = silence)
function levelToNorm(linear: number): number {
  if (linear <= 0) return 0;
  const db = LINEAR_TO_DB(linear);
  // Plage affichée : -60 dB (bas) à 0 dB (haut)
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

function levelToColor(linear: number): string {
  const db = LINEAR_TO_DB(linear);
  if (db > -3) return 'var(--vu-red, #e74c3c)';
  if (db > -12) return 'var(--vu-yellow, #f39c12)';
  return 'var(--vu-green, #2ecc71)';
}

/**
 * VU-mètre stéréo (L + R) avec peak hold (~1.5s).
 * Mise à jour depuis les props — pas de polling interne.
 */
export function VuMeter({ meter, height = 80 }: VuMeterProps) {
  // Peak hold : valeur maximum conservée 45 frames (~1.5s à 30fps)
  const peakHoldL = useRef({ value: 0, count: 0 });
  const peakHoldR = useRef({ value: 0, count: 0 });

  const PEAK_HOLD_FRAMES = 45;

  // Mettre à jour le peak hold à chaque render
  if (meter.peakL > peakHoldL.current.value) {
    peakHoldL.current = { value: meter.peakL, count: PEAK_HOLD_FRAMES };
  } else {
    peakHoldL.current.count = Math.max(0, peakHoldL.current.count - 1);
    if (peakHoldL.current.count === 0) peakHoldL.current.value = 0;
  }
  if (meter.peakR > peakHoldR.current.value) {
    peakHoldR.current = { value: meter.peakR, count: PEAK_HOLD_FRAMES };
  } else {
    peakHoldR.current.count = Math.max(0, peakHoldR.current.count - 1);
    if (peakHoldR.current.count === 0) peakHoldR.current.value = 0;
  }

  const normL = levelToNorm(meter.rmsL);
  const normR = levelToNorm(meter.rmsR);
  const peakNormL = levelToNorm(peakHoldL.current.value);
  const peakNormR = levelToNorm(peakHoldR.current.value);

  const barH = height - 4;

  return (
    <div className={styles.vuMeter} style={{ height }} aria-label="VU-mètre">
      {/* Canal Gauche */}
      <div className={styles.channel}>
        <div className={styles.bar} style={{ height: barH }}>
          <div
            className={styles.fill}
            style={{
              height: `${normL * 100}%`,
              background: levelToColor(meter.rmsL),
            }}
          />
          {peakNormL > 0 && (
            <div
              className={styles.peak}
              style={{
                bottom: `${peakNormL * 100}%`,
                background: levelToColor(peakHoldL.current.value),
              }}
            />
          )}
        </div>
        <div className={styles.label}>L</div>
      </div>
      {/* Canal Droit */}
      <div className={styles.channel}>
        <div className={styles.bar} style={{ height: barH }}>
          <div
            className={styles.fill}
            style={{
              height: `${normR * 100}%`,
              background: levelToColor(meter.rmsR),
            }}
          />
          {peakNormR > 0 && (
            <div
              className={styles.peak}
              style={{
                bottom: `${peakNormR * 100}%`,
                background: levelToColor(peakHoldR.current.value),
              }}
            />
          )}
        </div>
        <div className={styles.label}>R</div>
      </div>
    </div>
  );
}
