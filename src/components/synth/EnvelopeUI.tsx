import { useCallback, useMemo } from 'react';
import styles from './EnvelopeUI.module.css';
import { Knob } from '../shared/Knob';
import { useSynthStore } from '../../stores/synthStore';

const W = 220;
const H = 64;
const PAD = 8;

/**
 * Section Enveloppe ADSR :
 * - Courbe ADSR graphique (SVG)
 * - 4 knobs : Attack, Decay, Sustain, Release
 */
export function EnvelopeUI() {
  const { params, setParam } = useSynthStore();
  const { attack, decay, sustain, release } = params;

  const handleAttack  = useCallback((v: number) => setParam('attack',  v), [setParam]);
  const handleDecay   = useCallback((v: number) => setParam('decay',   v), [setParam]);
  const handleSustain = useCallback((v: number) => setParam('sustain', v), [setParam]);
  const handleRelease = useCallback((v: number) => setParam('release', v), [setParam]);

  // ── Courbe ADSR ─────────────────────────────────────────────────────────────
  const curve = useMemo(() => {
    // Normalise les durées pour dessiner sur la largeur disponible
    const usableW = W - PAD * 2;
    const usableH = H - PAD * 2;

    // Budget de temps : attack + decay + sustain-plateau + release
    const sustainPlateauSec = 0.3; // durée fixe du plateau visuel
    const total = attack + decay + sustainPlateauSec + release;
    const scale = usableW / Math.max(total, 0.001);

    const x0 = PAD;                                           // début
    const xA = x0 + attack * scale;                          // fin attack
    const xD = xA + decay * scale;                           // fin decay
    const xS = xD + sustainPlateauSec * scale;               // fin plateau sustain
    const xR = xS + release * scale;                         // fin release
    const yTop = PAD;                                        // y = max amplitude
    const yBot = PAD + usableH;                              // y = zéro
    const ySustain = yTop + (1 - sustain) * usableH;        // y = sustain level

    return `M ${x0},${yBot} L ${xA},${yTop} L ${xD},${ySustain} L ${xS},${ySustain} L ${xR},${yBot}`;
  }, [attack, decay, sustain, release]);

  return (
    <section className={styles.envelopeSection}>
      <h3 className={styles.sectionTitle}>Enveloppe ADSR</h3>

      {/* Courbe graphique */}
      <svg
        className={styles.curveSvg}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-label="Courbe ADSR"
      >
        {/* Baseline */}
        <line
          x1={PAD} y1={H - PAD}
          x2={W - PAD} y2={H - PAD}
          stroke="var(--color-border)"
          strokeWidth={0.5}
        />
        {/* Courbe */}
        <path
          d={curve}
          fill="color-mix(in srgb, var(--color-accent) 15%, transparent)"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Knobs */}
      <div className={styles.knobRow}>
        <Knob
          label="Attack"
          value={attack}
          min={0.001}
          max={5}
          defaultValue={0.010}
          unit=" s"
          decimals={3}
          size={44}
          onChange={handleAttack}
        />
        <Knob
          label="Decay"
          value={decay}
          min={0.001}
          max={5}
          defaultValue={0.100}
          unit=" s"
          decimals={3}
          size={44}
          onChange={handleDecay}
        />
        <Knob
          label="Sustain"
          value={sustain}
          min={0}
          max={1}
          defaultValue={0.7}
          decimals={2}
          size={44}
          onChange={handleSustain}
        />
        <Knob
          label="Release"
          value={release}
          min={0.001}
          max={10}
          defaultValue={0.200}
          unit=" s"
          decimals={3}
          size={44}
          onChange={handleRelease}
        />
      </div>
    </section>
  );
}
