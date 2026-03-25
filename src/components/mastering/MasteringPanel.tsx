import { useState, useCallback } from 'react';
import styles from './MasteringPanel.module.css';
import { LevelGate } from '../shared/LevelGate';
import { MasterEqUI } from './MasterEqUI';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import { LimiterUI } from './LimiterUI';
import { LoudnessMeter } from './LoudnessMeter';
import { useMixerStore } from '../../stores/mixerStore';
import { setMasterChainEnabled } from '../../utils/tauri-commands';

/**
 * Panneau de mastering complet (Level 5).
 * EQ 5 bandes + analyseur de spectre + limiteur + LUFS meter.
 */
export function MasteringPanel() {
  const [enabled, setEnabled] = useState(false);
  const [limiterThreshold, setLimiterThreshold] = useState(-1.0);

  // Lire les données du meter report via le mixerStore.
  const masteringData = useMixerStore(s => s.masteringData);

  const handleToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setMasterChainEnabled(next).catch(console.error);
  }, [enabled]);

  return (
    <LevelGate level={5}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.icon}>🎛️</span>
          <h2 className={styles.title}>Mastering</h2>
          <button
            className={`${styles.enableBtn} ${enabled ? styles.enableActive : ''}`}
            onClick={handleToggle}
            aria-pressed={enabled}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Spectrum Analyzer */}
        <SpectrumAnalyzer bins={masteringData.spectrum} width={580} height={140} />

        {/* EQ */}
        <MasterEqUI />

        {/* Bottom row : Limiter + LUFS */}
        <div className={styles.bottomRow}>
          <LimiterUI
            thresholdDb={limiterThreshold}
            gainReductionDb={masteringData.limiterGrDb}
            onThresholdChange={setLimiterThreshold}
          />
          <LoudnessMeter
            momentary={masteringData.lufsMomentary}
            shortterm={masteringData.lufsShortterm}
            integrated={masteringData.lufsIntegrated}
            truePeakDb={masteringData.truePeakDb}
          />
        </div>
      </div>
    </LevelGate>
  );
}
