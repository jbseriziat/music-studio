import { useRef, useEffect } from 'react';
import styles from './MasteringPanel.module.css';

interface Props {
  bins: number[];  // 64 bins, magnitude en dB (-70 to ~0)
  width?: number;
  height?: number;
}

/**
 * Analyseur de spectre FFT — barres verticales colorées en dégradé.
 * Rendu Canvas, mise à jour via les bins du meter report.
 */
export function SpectrumAnalyzer({ bins, width = 580, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const numBins = bins.length || 64;
    const barW = (width - 4) / numBins;
    const gap = 1;

    for (let i = 0; i < numBins; i++) {
      const db = bins[i] ?? -70;
      // Normaliser -70..0 dB → 0..1.
      const norm = Math.max(0, Math.min(1, (db + 70) / 70));
      const barH = norm * (height - 8);
      const x = 2 + i * barW;
      const y = height - 4 - barH;

      // Dégradé vert → jaune → rouge.
      let r: number, g: number, b: number;
      if (norm < 0.5) {
        r = Math.round(norm * 2 * 255);
        g = 200;
        b = 60;
      } else if (norm < 0.8) {
        r = 255;
        g = Math.round(200 - (norm - 0.5) * 3.3 * 200);
        b = 40;
      } else {
        r = 255;
        g = 40;
        b = 40;
      }

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, barW - gap, barH);
    }
  }, [bins, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.spectrumCanvas}
      style={{ width, height }}
    />
  );
}
