import { useCallback } from 'react';
import styles from './OscillatorUI.module.css';
import { WaveformDisplay } from './WaveformDisplay';
import { Knob } from '../shared/Knob';
import { useSynthStore, type Waveform } from '../../stores/synthStore';

const WAVEFORMS: { id: Waveform; label: string; symbol: string }[] = [
  { id: 'sine',     label: 'Sinus',     symbol: '∿' },
  { id: 'square',   label: 'Carré',     symbol: '⊓' },
  { id: 'sawtooth', label: 'Dent scie', symbol: '⩘' },
  { id: 'triangle', label: 'Triangle',  symbol: '△' },
];

/**
 * Section Oscillateur :
 * - Sélecteur 4 formes d'onde (boutons visuels)
 * - WaveformDisplay (oscilloscope)
 * - Knob Octave (-2 à +2)
 * - Knob Detune (-50 à +50 cents)
 */
export function OscillatorUI() {
  const { params, setParam } = useSynthStore();

  const handleWaveform = useCallback((wf: Waveform) => {
    setParam('waveform', wf);
  }, [setParam]);

  const handleOctave = useCallback((v: number) => {
    setParam('octave', Math.round(v));
  }, [setParam]);

  const handleDetune = useCallback((v: number) => {
    setParam('detune', v);
  }, [setParam]);

  return (
    <section className={styles.oscillatorSection}>
      <h3 className={styles.sectionTitle}>Oscillateur</h3>

      {/* Sélecteur de forme d'onde */}
      <div className={styles.waveformButtons}>
        {WAVEFORMS.map(wf => (
          <button
            key={wf.id}
            className={`${styles.waveBtn} ${params.waveform === wf.id ? styles.active : ''}`}
            onClick={() => handleWaveform(wf.id)}
            title={wf.label}
            aria-label={wf.label}
            aria-pressed={params.waveform === wf.id}
          >
            <span className={styles.waveBtnSymbol}>{wf.symbol}</span>
            <span className={styles.waveBtnLabel}>{wf.label}</span>
          </button>
        ))}
      </div>

      {/* Oscilloscope */}
      <div className={styles.displayWrapper}>
        <WaveformDisplay waveform={params.waveform} width={220} height={52} />
      </div>

      {/* Knobs */}
      <div className={styles.knobRow}>
        <Knob
          label="Octave"
          value={params.octave}
          min={-2}
          max={2}
          defaultValue={0}
          decimals={0}
          size={46}
          onChange={handleOctave}
        />
        <Knob
          label="Detune"
          value={params.detune}
          min={-50}
          max={50}
          defaultValue={0}
          decimals={0}
          unit=" ¢"
          size={46}
          onChange={handleDetune}
        />
      </div>
    </section>
  );
}
