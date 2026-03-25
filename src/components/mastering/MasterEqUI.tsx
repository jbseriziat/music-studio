import { useState, useCallback } from 'react';
import styles from './MasteringPanel.module.css';
import { Knob } from '../shared/Knob';
import { setMasterEqBand } from '../../utils/tauri-commands';

interface BandState {
  gain: number;
  freq: number;
  q: number;
}

const DEFAULT_BANDS: BandState[] = [
  { gain: 0, freq: 80,    q: 0.7 },
  { gain: 0, freq: 300,   q: 1.0 },
  { gain: 0, freq: 1000,  q: 1.0 },
  { gain: 0, freq: 4000,  q: 1.0 },
  { gain: 0, freq: 12000, q: 0.7 },
];

const BAND_LABELS = ['Low', 'Low-Mid', 'Mid', 'High-Mid', 'High'];
const BAND_COLORS = ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#f44336'];

/**
 * EQ Master 5 bandes avec knobs Gain/Freq/Q par bande.
 */
export function MasterEqUI() {
  const [bands, setBands] = useState<BandState[]>(DEFAULT_BANDS);

  const handleParam = useCallback((bandIdx: number, param: 'gain' | 'freq' | 'q', value: number) => {
    setBands(prev => {
      const next = [...prev];
      next[bandIdx] = { ...next[bandIdx], [param]: value };
      setMasterEqBand(bandIdx, next[bandIdx].gain, next[bandIdx].freq, next[bandIdx].q)
        .catch(console.error);
      return next;
    });
  }, []);

  return (
    <div className={styles.eqSection}>
      <h4 className={styles.subTitle}>EQ Master</h4>
      <div className={styles.eqBands}>
        {bands.map((band, i) => (
          <div key={i} className={styles.eqBand} style={{ borderColor: BAND_COLORS[i] }}>
            <span className={styles.bandLabel} style={{ color: BAND_COLORS[i] }}>
              {BAND_LABELS[i]}
            </span>
            <Knob
              label="Gain"
              value={band.gain}
              min={-12}
              max={12}
              defaultValue={0}
              decimals={1}
              unit=" dB"
              size={38}
              onChange={v => handleParam(i, 'gain', v)}
            />
            <Knob
              label="Freq"
              value={band.freq}
              min={20}
              max={20000}
              defaultValue={DEFAULT_BANDS[i].freq}
              decimals={0}
              unit=" Hz"
              size={38}
              onChange={v => handleParam(i, 'freq', v)}
            />
            <Knob
              label="Q"
              value={band.q}
              min={0.1}
              max={10}
              defaultValue={DEFAULT_BANDS[i].q}
              decimals={1}
              size={38}
              onChange={v => handleParam(i, 'q', v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
