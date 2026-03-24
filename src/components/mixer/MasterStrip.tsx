import { useCallback } from 'react';
import { useMixerStore, DB_TO_LINEAR } from '../../stores/mixerStore';
import { Fader } from '../shared/Fader';
import { VuMeter } from './VuMeter';
import { setMasterVolume } from '../../utils/tauri-commands';
import styles from './MasterStrip.module.css';

/**
 * Tranche Master du mixer — volume global + VU-mètre master.
 */
export function MasterStrip() {
  const masterVolumeDb = useMixerStore((s) => s.masterVolumeDb);
  const masterMeter = useMixerStore((s) => s.masterMeter);
  const setStoreVolume = useMixerStore((s) => s.setMasterVolume);
  const ZERO_METER = { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };

  const handleVolumeChange = useCallback(
    (db: number) => {
      const linear = DB_TO_LINEAR(db);
      setStoreVolume(linear);
      setMasterVolume(linear).catch(console.error);
    },
    [setStoreVolume]
  );

  return (
    <div className={styles.master} aria-label="Master">
      {/* Nom */}
      <div className={styles.header}>
        <span className={styles.icon}>🎚️</span>
        <span className={styles.name}>Master</span>
      </div>

      {/* Placeholder effets master */}
      <div className={styles.effectsPlaceholder}>
        <span className={styles.effectsLabel}>FX</span>
      </div>

      {/* Fader + VU-mètre (plus large) */}
      <div className={styles.faderRow}>
        <Fader
          valueDb={isFinite(masterVolumeDb) ? masterVolumeDb : 0}
          min={-60}
          max={6}
          height={140}
          onChange={handleVolumeChange}
        />
        <VuMeter meter={masterMeter ?? ZERO_METER} height={140} />
      </div>
    </div>
  );
}
