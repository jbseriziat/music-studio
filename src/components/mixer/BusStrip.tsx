import { useCallback } from 'react';
import styles from './BusStrip.module.css';
import { Knob } from '../shared/Knob';
import { setBusVolume } from '../../utils/tauri-commands';

interface BusStripProps {
  busId: number;
  name: string;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onDelete: () => void;
}

/**
 * Tranche de bus d'effets dans le Mixer.
 * Affiche le nom, un fader de volume, et un bouton supprimer.
 */
export function BusStrip({ busId, name, volume, onVolumeChange, onDelete }: BusStripProps) {
  const handleVolume = useCallback((v: number) => {
    onVolumeChange(v);
    setBusVolume(busId, v).catch(console.error);
  }, [busId, onVolumeChange]);

  return (
    <div className={styles.strip}>
      <div className={styles.header}>
        <span className={styles.icon}>🔀</span>
        <span className={styles.name}>{name}</span>
        <button className={styles.deleteBtn} onClick={onDelete} title="Supprimer le bus">✕</button>
      </div>
      <Knob
        label="Vol"
        value={volume}
        min={0}
        max={2}
        defaultValue={1}
        decimals={2}
        size={42}
        onChange={handleVolume}
      />
    </div>
  );
}
