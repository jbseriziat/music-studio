import { useCallback, useEffect, useRef, useState } from 'react';
import { Knob } from '../shared/Knob';
import { setEffectParam, getCompressorGainReduction } from '../../utils/tauri-commands';
import { useEffectsStore } from '../../stores/effectsStore';
import styles from './CompressorUI.module.css';

// ─── SVG transfer-curve constants ────────────────────────────────────────────

const W = 150;
const H = 150;
// Input/output range: -60 to 0 dB on both axes.
const DB_MIN = -60;
const DB_MAX = 0;

function dbToX(db: number): number {
  return ((db - DB_MIN) / (DB_MAX - DB_MIN)) * W;
}
function dbToY(db: number): number {
  return H - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * H;
}

/** Computes the SVG path for the compressor transfer curve. */
function transferPath(thresholdDb: number, ratio: number): string {
  const pts: string[] = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const inDb = DB_MIN + (i / N) * (DB_MAX - DB_MIN);
    const outDb = inDb <= thresholdDb
      ? inDb
      : thresholdDb + (inDb - thresholdDb) / ratio;
    const x = dbToX(inDb);
    const y = dbToY(Math.max(DB_MIN, outDb));
    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CompressorUIProps {
  trackId: string;
  effectId: number;
  params: Record<string, number>;
}

export function CompressorUI({ trackId, effectId, params }: CompressorUIProps) {
  const setParam = useEffectsStore((s) => s.setEffectParam);
  const [gainReduction, setGainReduction] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const threshold = params.threshold ?? -20;
  const ratio     = params.ratio    ?? 4;
  const attack    = params.attack   ?? 10;
  const release   = params.release  ?? 100;
  const makeup    = params.makeup   ?? 0;

  const handleChange = useCallback(
    (name: string, value: number) => {
      setParam(trackId, effectId, name, value);
      setEffectParam(Number(trackId), effectId, name, value).catch(console.error);
    },
    [trackId, effectId, setParam],
  );

  // Poll gain reduction every 80ms for the VU indicator.
  useEffect(() => {
    pollRef.current = setInterval(() => {
      getCompressorGainReduction(Number(trackId), effectId)
        .then(setGainReduction)
        .catch(() => {});
    }, 80);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [trackId, effectId]);

  const curve = transferPath(threshold, ratio);

  // Gain-reduction bar: 0 = no reduction (top), maxGR dB = full bar.
  const maxGR = 24;
  const grBarHeight = Math.min(1, gainReduction / maxGR) * (H - 20);
  const grBarY = 10;

  return (
    <div className={styles.compRoot}>
      {/* ── Transfer curve ── */}
      <div className={styles.graphRow}>
        <svg className={styles.transferSvg} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* Background grid */}
          <line x1={dbToX(threshold)} y1={0} x2={dbToX(threshold)} y2={H}
            stroke="rgba(255,140,0,0.35)" strokeWidth={1} strokeDasharray="3,2" />
          {/* Unity line */}
          <line x1={0} y1={H} x2={W} y2={0}
            stroke="var(--color-border)" strokeWidth={0.75} opacity={0.5} />
          {/* Curve */}
          <path d={curve} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
          {/* Threshold dot */}
          <circle
            cx={dbToX(threshold)} cy={dbToY(threshold)}
            r={4} fill="#f39c12"
          />
          {/* Labels */}
          <text x={2} y={12} fill="var(--color-text-muted,#777)" fontSize={8}>0</text>
          <text x={2} y={H - 2} fill="var(--color-text-muted,#777)" fontSize={8}>-60</text>
        </svg>

        {/* ── Gain-reduction indicator ── */}
        <div className={styles.grColumn}>
          <span className={styles.grLabel}>GR</span>
          <div className={styles.grTrack}>
            <div
              className={styles.grBar}
              style={{ height: `${grBarHeight}px`, top: `${grBarY}px` }}
            />
          </div>
          <span className={styles.grValue}>{gainReduction.toFixed(1)}</span>
        </div>
      </div>

      {/* ── Knobs ── */}
      <div className={styles.knobs}>
        <Knob value={threshold} min={-40} max={0}    label="Thr"  unit="dB" decimals={1}
          defaultValue={-20} size={34} onChange={(v) => handleChange('threshold', v)} />
        <Knob value={ratio}     min={1}   max={20}   label="Ratio" decimals={1}
          defaultValue={4} size={34} onChange={(v) => handleChange('ratio', v)} />
        <Knob value={attack}    min={0.1} max={100}  label="Att"  unit="ms" decimals={1}
          defaultValue={10} size={34} onChange={(v) => handleChange('attack', v)} />
        <Knob value={release}   min={10}  max={1000} label="Rel"  unit="ms" decimals={0}
          defaultValue={100} size={34} onChange={(v) => handleChange('release', v)} />
        <Knob value={makeup}    min={0}   max={24}   label="MkUp" unit="dB" decimals={1}
          defaultValue={0} size={34} onChange={(v) => handleChange('makeup', v)} />
      </div>
    </div>
  );
}
