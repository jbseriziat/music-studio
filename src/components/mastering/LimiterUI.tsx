import { useCallback } from 'react';
import styles from './MasteringPanel.module.css';
import { Knob } from '../shared/Knob';
import { setLimiterThreshold } from '../../utils/tauri-commands';

interface Props {
  thresholdDb: number;
  gainReductionDb: number;
  onThresholdChange: (db: number) => void;
}

/**
 * Limiteur Brickwall : knob threshold + indicateur de gain reduction.
 */
export function LimiterUI({ thresholdDb, gainReductionDb, onThresholdChange }: Props) {
  const handleThreshold = useCallback((v: number) => {
    onThresholdChange(v);
    setLimiterThreshold(v).catch(console.error);
  }, [onThresholdChange]);

  // GR bar : 0 = rien, 12 dB max.
  const grNorm = Math.min(1, gainReductionDb / 12);

  return (
    <div className={styles.limiterSection}>
      <h4 className={styles.subTitle}>Limiteur</h4>
      <div className={styles.limiterRow}>
        <Knob
          label="Threshold"
          value={thresholdDb}
          min={-12}
          max={0}
          defaultValue={-1}
          decimals={1}
          unit=" dB"
          size={50}
          onChange={handleThreshold}
        />
        <div className={styles.grColumn}>
          <div className={styles.grLabel}>GR</div>
          <div className={styles.grBarOuter}>
            <div
              className={styles.grBarInner}
              style={{ height: `${grNorm * 100}%` }}
            />
          </div>
          <div className={styles.grValue}>
            {gainReductionDb > 0.01 ? `-${gainReductionDb.toFixed(1)} dB` : '0 dB'}
          </div>
        </div>
      </div>
    </div>
  );
}
