import { useCallback, useMemo } from 'react';
import styles from './FilterUI.module.css';
import { Knob } from '../shared/Knob';
import { useSynthStore } from '../../stores/synthStore';
import { useFeatureLevel } from '../../hooks/useFeatureLevel';

const FILTER_TYPES = [
  { index: 0, label: 'LP 12dB' },
  { index: 1, label: 'LP 24dB' },
  { index: 2, label: 'HP' },
  { index: 3, label: 'BP' },
  { index: 4, label: 'Notch' },
];

const W = 220;
const H = 64;
const PAD = 8;

/**
 * Section Filtre Low-Pass :
 * - Courbe de réponse en fréquence (SVG)
 * - Knob Cutoff (20–20000 Hz)
 * - Knob Resonance (0–1)
 */
export function FilterUI() {
  const { params, setParam } = useSynthStore();
  const { cutoff, resonance } = params;
  const { isVisible } = useFeatureLevel();

  const handleCutoff    = useCallback((v: number) => setParam('cutoff',    v), [setParam]);
  const handleResonance = useCallback((v: number) => setParam('resonance', v), [setParam]);
  const handleDrive     = useCallback((v: number) => setParam('drive',     v), [setParam]);
  const handleFilterType = useCallback((v: number) => setParam('filter_type', v), [setParam]);

  // ── Courbe de réponse (low-pass simplifié, graphique uniquement) ─────────────
  const responseCurve = useMemo(() => {
    const usableW = W - PAD * 2;
    const usableH = H - PAD * 2;
    const freqMin = 20;
    const freqMax = 20000;

    // Normalise la fréquence de coupure en position X (échelle log)
    const cutoffNorm = Math.log(cutoff / freqMin) / Math.log(freqMax / freqMin);

    const points: string[] = [];
    const STEPS = 100;

    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const normFreq = t;

      // Gain simplifié : 0 dB avant coupure, −12 dB/octave après (avec resonance bump)
      let gain: number;
      if (normFreq < cutoffNorm) {
        // Avant la coupure : plat avec légère bosse de résonance proche de la coupure
        const proximity = normFreq / Math.max(cutoffNorm, 0.01);
        const dist = (1 - proximity) * 12;
        const bump = resonance * 0.5 * Math.exp(-(dist * dist));
        gain = 1.0 + bump;
      } else {
        // Après la coupure : pente −24 dB/oct
        const octavesAbove = (normFreq - cutoffNorm) * Math.log2(freqMax / freqMin);
        gain = Math.pow(10, -(octavesAbove * 24) / 20);
      }

      const px = PAD + normFreq * usableW;
      // Clamp le gain en [0,1] pour l'affichage
      const clampedGain = Math.min(1.5, Math.max(0, gain));
      const py = PAD + usableH - clampedGain * usableH;
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }

    return points.join(' ');
  }, [cutoff, resonance]);

  // Position X du marqueur de coupure (échelle log)
  const cutoffX = useMemo(() => {
    const usableW = W - PAD * 2;
    const freqMin = 20;
    const freqMax = 20000;
    const norm = Math.log(cutoff / freqMin) / Math.log(freqMax / freqMin);
    return PAD + norm * usableW;
  }, [cutoff]);

  // Formatage Hz / kHz
  const formatHz = (hz: number) =>
    hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;

  const filterLabel = isVisible(5) ? FILTER_TYPES[params.filter_type]?.label ?? 'Filtre' : 'Filtre Low-Pass';

  return (
    <section className={styles.filterSection}>
      <h3 className={styles.sectionTitle}>{filterLabel}</h3>

      {/* Filter type selector — Phase 5 */}
      {isVisible(5) && (
        <div className={styles.filterTypeRow}>
          {FILTER_TYPES.map(ft => (
            <button
              key={ft.index}
              className={`${styles.filterTypeBtn} ${params.filter_type === ft.index ? styles.filterTypeActive : ''}`}
              onClick={() => handleFilterType(ft.index)}
              aria-pressed={params.filter_type === ft.index}
            >
              {ft.label}
            </button>
          ))}
        </div>
      )}

      {/* Courbe de réponse */}
      <svg
        className={styles.curveSvg}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-label="Courbe de réponse filtre"
      >
        {/* Ligne de référence 0 dB */}
        <line
          x1={PAD} y1={PAD}
          x2={W - PAD} y2={PAD}
          stroke="var(--color-border)"
          strokeWidth={0.5}
          strokeDasharray="3,3"
        />
        {/* Remplissage */}
        <polyline
          points={`${PAD},${H - PAD} ${responseCurve} ${W - PAD},${H - PAD}`}
          fill="color-mix(in srgb, var(--color-accent) 12%, transparent)"
          stroke="none"
        />
        {/* Courbe */}
        <polyline
          points={responseCurve}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Marqueur coupure vertical */}
        <line
          x1={cutoffX} y1={PAD}
          x2={cutoffX} y2={H - PAD}
          stroke="var(--color-accent)"
          strokeWidth={1}
          strokeDasharray="2,3"
          opacity={0.6}
        />
      </svg>

      {/* Knobs */}
      <div className={styles.knobRow}>
        <Knob
          label="Cutoff"
          value={cutoff}
          min={20}
          max={20000}
          defaultValue={8000}
          decimals={0}
          unit=" Hz"
          size={46}
          onChange={handleCutoff}
        />
        <Knob
          label="Reson."
          value={resonance}
          min={0}
          max={1}
          defaultValue={0}
          decimals={2}
          size={46}
          onChange={handleResonance}
        />
        <div className={styles.freqDisplay} title="Fréquence de coupure">
          {formatHz(cutoff)}
        </div>
        {isVisible(5) && (
          <Knob
            label="Drive"
            value={params.drive}
            min={0}
            max={1}
            defaultValue={0}
            decimals={2}
            size={46}
            onChange={handleDrive}
          />
        )}
      </div>
    </section>
  );
}
