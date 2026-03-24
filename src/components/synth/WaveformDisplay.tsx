import styles from './WaveformDisplay.module.css';
import type { Waveform } from '../../stores/synthStore';

interface WaveformDisplayProps {
  waveform: Waveform;
  /** Largeur en pixels (défaut 120) */
  width?: number;
  /** Hauteur en pixels (défaut 48) */
  height?: number;
}

/**
 * Oscilloscope simplifié — affiche 2 cycles de la forme d'onde sélectionnée.
 * Rendu SVG, pas d'animations, purement décoratif.
 */
export function WaveformDisplay({ waveform, width = 120, height = 48 }: WaveformDisplayProps) {
  const points = buildPath(waveform, width, height);

  return (
    <svg
      className={styles.display}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`Forme d'onde : ${waveform}`}
    >
      {/* Fond avec grille subtile */}
      <line x1={0} y1={height / 2} x2={width} y2={height / 2}
        stroke="var(--color-border)" strokeWidth={0.5} />

      {/* Forme d'onde */}
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Calcule les points SVG pour 2 cycles de la forme d'onde. */
function buildPath(waveform: Waveform, w: number, h: number): string {
  const SAMPLES = 200;
  const mid = h / 2;
  const amp = h * 0.42; // légère marge
  const pts: string[] = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;           // [0, 1]
    const phase = (t * 2) % 1.0;    // 2 cycles

    let y: number;
    switch (waveform) {
      case 'sine':
        y = Math.sin(phase * 2 * Math.PI);
        break;
      case 'square':
        y = phase < 0.5 ? 1 : -1;
        break;
      case 'sawtooth':
        y = 2 * phase - 1;
        break;
      case 'triangle':
        y = 4 * Math.abs(phase - Math.round(phase)) - 1;
        break;
      default:
        y = 0;
    }

    const px = t * w;
    const py = mid - y * amp;
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }

  return pts.join(' ');
}
