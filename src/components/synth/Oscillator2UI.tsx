import { useCallback } from 'react';
import styles from './OscillatorUI.module.css';
import { WaveformDisplay } from './WaveformDisplay';
import { Knob } from '../shared/Knob';
import { useSynthStore, type Waveform } from '../../stores/synthStore';

const WAVEFORMS: { id: Waveform; label: string; symbol: string }[] = [
  { id: 'sine',       label: 'Sinus',     symbol: '∿' },
  { id: 'square',     label: 'Carré',     symbol: '⊓' },
  { id: 'sawtooth',   label: 'Dent scie', symbol: '⩘' },
  { id: 'triangle',   label: 'Triangle',  symbol: '△' },
  { id: 'noise',      label: 'Bruit',     symbol: '〰' },
  { id: 'pulsewidth', label: 'PWM',       symbol: '⊔' },
];

/**
 * Section Oscillateur 2 (Phase 5, level 5) :
 * - Toggle on/off
 * - Sélecteur 6 formes d'onde
 * - WaveformDisplay
 * - Knob Octave, Detune
 * - Slider Osc Mix
 */
export function Oscillator2UI() {
  const { params, setParam } = useSynthStore();

  const handleToggle = useCallback(() => {
    setParam('osc2_enabled', !params.osc2_enabled);
  }, [params.osc2_enabled, setParam]);

  const handleWaveform = useCallback((wf: Waveform) => {
    setParam('osc2_waveform', wf);
  }, [setParam]);

  const handleOctave = useCallback((v: number) => {
    setParam('osc2_octave', Math.round(v));
  }, [setParam]);

  const handleDetune = useCallback((v: number) => {
    setParam('osc2_detune', v);
  }, [setParam]);

  const handleMix = useCallback((v: number) => {
    setParam('osc_mix', v);
  }, [setParam]);

  return (
    <section className={styles.oscillatorSection}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Oscillateur 2</h3>
        <button
          className={`${styles.toggleBtn} ${params.osc2_enabled ? styles.toggleActive : ''}`}
          onClick={handleToggle}
          title={params.osc2_enabled ? 'Désactiver Osc2' : 'Activer Osc2'}
          aria-pressed={params.osc2_enabled}
        >
          {params.osc2_enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {params.osc2_enabled && (
        <>
          {/* Sélecteur de forme d'onde */}
          <div className={styles.waveformButtons}>
            {WAVEFORMS.map(wf => (
              <button
                key={wf.id}
                className={`${styles.waveBtn} ${params.osc2_waveform === wf.id ? styles.active : ''}`}
                onClick={() => handleWaveform(wf.id)}
                title={wf.label}
                aria-label={wf.label}
                aria-pressed={params.osc2_waveform === wf.id}
              >
                <span className={styles.waveBtnSymbol}>{wf.symbol}</span>
                <span className={styles.waveBtnLabel}>{wf.label}</span>
              </button>
            ))}
          </div>

          {/* Oscilloscope */}
          <div className={styles.displayWrapper}>
            <WaveformDisplay waveform={params.osc2_waveform} width={220} height={52} />
          </div>

          {/* Knobs */}
          <div className={styles.knobRow}>
            <Knob
              label="Octave"
              value={params.osc2_octave}
              min={-2}
              max={2}
              defaultValue={0}
              decimals={0}
              size={46}
              onChange={handleOctave}
            />
            <Knob
              label="Detune"
              value={params.osc2_detune}
              min={-50}
              max={50}
              defaultValue={0}
              decimals={0}
              unit=" ¢"
              size={46}
              onChange={handleDetune}
            />
          </div>

          {/* Osc Mix slider */}
          <div className={styles.mixRow}>
            <span className={styles.mixLabel}>Osc1</span>
            <input
              type="range"
              className={styles.mixSlider}
              min={0}
              max={1}
              step={0.01}
              value={params.osc_mix}
              onChange={e => handleMix(parseFloat(e.target.value))}
            />
            <span className={styles.mixLabel}>Osc2</span>
          </div>
        </>
      )}
    </section>
  );
}
