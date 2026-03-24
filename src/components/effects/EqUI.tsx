import { useCallback, useMemo, useRef } from 'react';
import { Knob } from '../shared/Knob';
import { setEffectParam } from '../../utils/tauri-commands';
import { useEffectsStore } from '../../stores/effectsStore';
import styles from './EqUI.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EqUIProps {
  trackId: string;
  effectId: number;
  params: Record<string, number>;
}

interface BandCoeffs {
  b0: number; b1: number; b2: number; a1: number; a2: number;
}

// ─── Biquad coefficient computation (same formulas as Rust, Audio EQ Cookbook)

const SAMPLE_RATE = 48000;

function lowShelfCoeffs(freq: number, gainDb: number, q: number): BandCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / SAMPLE_RATE;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * q);
  const sqrtA = Math.sqrt(A);
  const b0 = A * ((A + 1) - (A - 1) * cosW + 2 * sqrtA * alpha);
  const b1 = 2 * A * ((A - 1) - (A + 1) * cosW);
  const b2 = A * ((A + 1) - (A - 1) * cosW - 2 * sqrtA * alpha);
  const a0 = (A + 1) + (A - 1) * cosW + 2 * sqrtA * alpha;
  const a1 = -2 * ((A - 1) + (A + 1) * cosW);
  const a2 = (A + 1) + (A - 1) * cosW - 2 * sqrtA * alpha;
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 };
}

function highShelfCoeffs(freq: number, gainDb: number, q: number): BandCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / SAMPLE_RATE;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * q);
  const sqrtA = Math.sqrt(A);
  const b0 = A * ((A + 1) + (A - 1) * cosW + 2 * sqrtA * alpha);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
  const b2 = A * ((A + 1) + (A - 1) * cosW - 2 * sqrtA * alpha);
  const a0 = (A + 1) - (A - 1) * cosW + 2 * sqrtA * alpha;
  const a1 = 2 * ((A - 1) - (A + 1) * cosW);
  const a2 = (A + 1) - (A - 1) * cosW - 2 * sqrtA * alpha;
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 };
}

function peakingCoeffs(freq: number, gainDb: number, q: number): BandCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / SAMPLE_RATE;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cosW;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosW;
  const a2 = 1 - alpha / A;
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 };
}

function biquadMagDb(c: BandCoeffs, freq: number): number {
  const w = (2 * Math.PI * freq) / SAMPLE_RATE;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);
  const numRe = c.b0 + c.b1 * cosW + c.b2 * cos2W;
  const numIm = -(c.b1 * sinW + c.b2 * sin2W);
  const denRe = 1 + c.a1 * cosW + c.a2 * cos2W;
  const denIm = -(c.a1 * sinW + c.a2 * sin2W);
  const numMagSq = numRe * numRe + numIm * numIm;
  const denMagSq = denRe * denRe + denIm * denIm;
  if (denMagSq < 1e-30) return 0;
  return 10 * Math.log10(Math.max(numMagSq / denMagSq, 1e-30));
}

// ─── SVG constants ───────────────────────────────────────────────────────────

const W = 300;
const H = 130;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GAIN_MIN = -12;
const GAIN_MAX = 12;
const N_POINTS = 120;

function freqToX(freq: number): number {
  return (Math.log10(freq / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN)) * W;
}

function gainToY(gainDb: number): number {
  return H - ((gainDb - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)) * H;
}

function xToFreq(x: number): number {
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, x / W);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EqUI({ trackId, effectId, params }: EqUIProps) {
  const setParam = useEffectsStore((s) => s.setEffectParam);

  const p = {
    lowGain:  params.low_gain  ?? 0,
    lowFreq:  params.low_freq  ?? 200,
    lowQ:     params.low_q     ?? 0.7,
    midGain:  params.mid_gain  ?? 0,
    midFreq:  params.mid_freq  ?? 1000,
    midQ:     params.mid_q     ?? 1.0,
    highGain: params.high_gain ?? 0,
    highFreq: params.high_freq ?? 5000,
    highQ:    params.high_q    ?? 0.7,
  };

  const handleChange = useCallback(
    (name: string, value: number) => {
      setParam(trackId, effectId, name, value);
      setEffectParam(Number(trackId), effectId, name, value).catch(console.error);
    },
    [trackId, effectId, setParam],
  );

  // Compute SVG curve path.
  const curvePath = useMemo(() => {
    const lowC  = lowShelfCoeffs(p.lowFreq,  p.lowGain,  p.lowQ);
    const midC  = peakingCoeffs( p.midFreq,  p.midGain,  p.midQ);
    const highC = highShelfCoeffs(p.highFreq, p.highGain, p.highQ);

    const pts: string[] = [];
    for (let i = 0; i <= N_POINTS; i++) {
      const freq = xToFreq((i / N_POINTS) * W);
      const db = biquadMagDb(lowC, freq) + biquadMagDb(midC, freq) + biquadMagDb(highC, freq);
      const x = (i / N_POINTS) * W;
      const y = gainToY(Math.max(GAIN_MIN, Math.min(GAIN_MAX, db)));
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [p.lowGain, p.lowFreq, p.lowQ, p.midGain, p.midFreq, p.midQ,
      p.highGain, p.highFreq, p.highQ]);

  // Drag state for the 3 control points.
  const dragRef = useRef<{
    band: 'low' | 'mid' | 'high';
    startX: number; startY: number;
    startFreq: number; startGain: number;
  } | null>(null);

  const startDrag = useCallback(
    (band: 'low' | 'mid' | 'high', e: React.MouseEvent<SVGCircleElement>) => {
      e.preventDefault();
      const freqKey = `${band}_freq`;
      const gainKey = `${band}_gain`;
      dragRef.current = {
        band,
        startX: e.clientX, startY: e.clientY,
        startFreq: params[freqKey] ?? 0,
        startGain: params[gainKey] ?? 0,
      };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const { band: b, startX, startY, startFreq, startGain } = dragRef.current;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newFreqX = Math.max(0, Math.min(W, freqToX(startFreq) + dx));
        const newFreq  = Math.round(xToFreq(newFreqX));
        const newGain  = Math.max(GAIN_MIN, Math.min(GAIN_MAX, startGain - dy * (24 / H)));
        handleChange(`${b}_freq`, newFreq);
        handleChange(`${b}_gain`, parseFloat(newGain.toFixed(1)));
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [params, handleChange],
  );

  // Control-point positions.
  const lowPt  = { x: freqToX(p.lowFreq),  y: gainToY(p.lowGain)  };
  const midPt  = { x: freqToX(p.midFreq),  y: gainToY(p.midGain)  };
  const highPt = { x: freqToX(p.highFreq), y: gainToY(p.highGain) };

  return (
    <div className={styles.eqRoot}>
      {/* ── Courbe de réponse ── */}
      <svg
        className={styles.curve}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
      >
        {/* Grid 0 dB line */}
        <line x1={0} y1={H / 2} x2={W} y2={H / 2}
          stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3,3" />
        {/* +6/-6 dB lines */}
        <line x1={0} y1={gainToY(6)}  x2={W} y2={gainToY(6)}
          stroke="var(--color-border)" strokeWidth={0.5} opacity={0.4} />
        <line x1={0} y1={gainToY(-6)} x2={W} y2={gainToY(-6)}
          stroke="var(--color-border)" strokeWidth={0.5} opacity={0.4} />

        {/* EQ curve */}
        <path d={curvePath} fill="none" stroke="var(--color-accent)" strokeWidth={2} />

        {/* Low control point */}
        <circle
          cx={lowPt.x} cy={lowPt.y} r={6}
          fill="var(--color-accent)" opacity={0.9} cursor="move"
          onMouseDown={(e) => startDrag('low', e)}
        />
        {/* Mid control point */}
        <circle
          cx={midPt.x} cy={midPt.y} r={6}
          fill="#f39c12" opacity={0.9} cursor="move"
          onMouseDown={(e) => startDrag('mid', e)}
        />
        {/* High control point */}
        <circle
          cx={highPt.x} cy={highPt.y} r={6}
          fill="#2ecc71" opacity={0.9} cursor="move"
          onMouseDown={(e) => startDrag('high', e)}
        />
      </svg>

      {/* ── Knobs par bande ── */}
      <div className={styles.bands}>
        {/* Low */}
        <div className={styles.band}>
          <span className={styles.bandLabel} style={{ color: 'var(--color-accent)' }}>Low</span>
          <Knob value={p.lowGain}  min={-12} max={12}   label="Gain" unit="dB" decimals={1}
            defaultValue={0} size={34} onChange={(v) => handleChange('low_gain', v)} />
          <Knob value={p.lowFreq}  min={20}  max={2000}  label="Freq" unit="Hz" decimals={0}
            defaultValue={200} size={34} onChange={(v) => handleChange('low_freq', v)} />
          <Knob value={p.lowQ}     min={0.1} max={10}    label="Q"    decimals={1}
            defaultValue={0.7} size={34} onChange={(v) => handleChange('low_q', v)} />
        </div>
        {/* Mid */}
        <div className={styles.band}>
          <span className={styles.bandLabel} style={{ color: '#f39c12' }}>Mid</span>
          <Knob value={p.midGain}  min={-12} max={12}    label="Gain" unit="dB" decimals={1}
            defaultValue={0} size={34} onChange={(v) => handleChange('mid_gain', v)} />
          <Knob value={p.midFreq}  min={200} max={8000}  label="Freq" unit="Hz" decimals={0}
            defaultValue={1000} size={34} onChange={(v) => handleChange('mid_freq', v)} />
          <Knob value={p.midQ}     min={0.1} max={10}    label="Q"    decimals={1}
            defaultValue={1.0} size={34} onChange={(v) => handleChange('mid_q', v)} />
        </div>
        {/* High */}
        <div className={styles.band}>
          <span className={styles.bandLabel} style={{ color: '#2ecc71' }}>High</span>
          <Knob value={p.highGain} min={-12} max={12}    label="Gain" unit="dB" decimals={1}
            defaultValue={0} size={34} onChange={(v) => handleChange('high_gain', v)} />
          <Knob value={p.highFreq} min={1000} max={20000} label="Freq" unit="Hz" decimals={0}
            defaultValue={5000} size={34} onChange={(v) => handleChange('high_freq', v)} />
          <Knob value={p.highQ}    min={0.1} max={10}    label="Q"    decimals={1}
            defaultValue={0.7} size={34} onChange={(v) => handleChange('high_q', v)} />
        </div>
      </div>
    </div>
  );
}
