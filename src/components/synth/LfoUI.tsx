import { useCallback } from 'react';
import styles from './LfoUI.module.css';
import { Knob } from '../shared/Knob';
import { useSynthStore, type LfoWaveform, type ModDestination } from '../../stores/synthStore';

const LFO_WAVEFORMS: { id: LfoWaveform; label: string; symbol: string }[] = [
  { id: 'sine',          label: 'Sin',  symbol: '∿' },
  { id: 'square',        label: 'Sqr',  symbol: '⊓' },
  { id: 'triangle',      label: 'Tri',  symbol: '△' },
  { id: 'saw',           label: 'Saw',  symbol: '⩘' },
  { id: 'sampleandhold', label: 'S&H',  symbol: '⊞' },
];

const DESTINATIONS: { id: ModDestination; label: string }[] = [
  { id: 'pitch',     label: 'Pitch' },
  { id: 'cutoff',    label: 'Cutoff' },
  { id: 'volume',    label: 'Volume' },
  { id: 'pan',       label: 'Pan' },
  { id: 'osc2pitch', label: 'Osc2 Pitch' },
  { id: 'resonance', label: 'Reso' },
];

interface LfoUIProps {
  /** 1 ou 2 */
  index: 1 | 2;
}

/**
 * Interface d'un LFO : waveform, rate, depth, destination, sync BPM.
 */
export function LfoUI({ index }: LfoUIProps) {
  const { params, setParam } = useSynthStore();

  const prefix = index === 1 ? 'lfo1' : 'lfo2';
  const waveform = index === 1 ? params.lfo1_waveform : params.lfo2_waveform;
  const rate = index === 1 ? params.lfo1_rate : params.lfo2_rate;
  const depth = index === 1 ? params.lfo1_depth : params.lfo2_depth;
  const destination = index === 1 ? params.lfo1_destination : params.lfo2_destination;
  const sync = index === 1 ? params.lfo1_sync : params.lfo2_sync;

  const setWf = useCallback((wf: LfoWaveform) => {
    setParam(`${prefix}_waveform` as keyof typeof params, wf);
  }, [prefix, setParam]);

  const setRate = useCallback((v: number) => {
    setParam(`${prefix}_rate` as keyof typeof params, v);
  }, [prefix, setParam]);

  const setDepth = useCallback((v: number) => {
    setParam(`${prefix}_depth` as keyof typeof params, v);
  }, [prefix, setParam]);

  const setDest = useCallback((d: ModDestination) => {
    setParam(`${prefix}_destination` as keyof typeof params, d);
  }, [prefix, setParam]);

  const toggleSync = useCallback(() => {
    setParam(`${prefix}_sync` as keyof typeof params, !sync);
  }, [prefix, sync, setParam]);

  return (
    <section className={styles.lfoSection}>
      <h3 className={styles.sectionTitle}>LFO {index}</h3>

      {/* Waveform selector */}
      <div className={styles.waveformRow}>
        {LFO_WAVEFORMS.map(wf => (
          <button
            key={wf.id}
            className={`${styles.waveBtn} ${waveform === wf.id ? styles.active : ''}`}
            onClick={() => setWf(wf.id)}
            title={wf.label}
            aria-pressed={waveform === wf.id}
          >
            <span className={styles.waveSym}>{wf.symbol}</span>
            <span className={styles.waveLabel}>{wf.label}</span>
          </button>
        ))}
      </div>

      {/* Rate + Depth knobs */}
      <div className={styles.knobRow}>
        <Knob
          label="Rate"
          value={rate}
          min={0.1}
          max={20}
          defaultValue={1.0}
          decimals={1}
          unit=" Hz"
          size={42}
          onChange={setRate}
        />
        <Knob
          label="Depth"
          value={depth}
          min={0}
          max={1}
          defaultValue={0}
          decimals={2}
          size={42}
          onChange={setDepth}
        />
      </div>

      {/* Destination dropdown */}
      <div className={styles.destRow}>
        <label className={styles.destLabel}>Dest</label>
        <select
          className={styles.destSelect}
          value={destination}
          onChange={e => setDest(e.target.value as ModDestination)}
        >
          {DESTINATIONS.map(d => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* BPM Sync toggle */}
      <button
        className={`${styles.syncBtn} ${sync ? styles.syncActive : ''}`}
        onClick={toggleSync}
        aria-pressed={sync}
      >
        🔗 Sync BPM
      </button>
    </section>
  );
}
