import { useCallback } from 'react';
import { Knob } from '../shared/Knob';
import { setEffectParam } from '../../utils/tauri-commands';
import { useEffectsStore } from '../../stores/effectsStore';
import styles from './EffectUI.module.css';

interface ReverbUIProps {
  trackId: string;
  effectId: number;
  params: Record<string, number>;
}

export function ReverbUI({ trackId, effectId, params }: ReverbUIProps) {
  const setParam = useEffectsStore((s) => s.setEffectParam);

  const handleChange = useCallback(
    (name: string, value: number) => {
      setParam(trackId, effectId, name, value);
      setEffectParam(Number(trackId), effectId, name, value).catch(console.error);
    },
    [trackId, effectId, setParam],
  );

  return (
    <div className={styles.params}>
      <div className={styles.param}>
        <Knob
          value={params.room_size ?? 0.5}
          min={0}
          max={1}
          label="Room"
          onChange={(v) => handleChange('room_size', v)}
        />
      </div>
      <div className={styles.param}>
        <Knob
          value={params.damping ?? 0.5}
          min={0}
          max={1}
          label="Damp"
          onChange={(v) => handleChange('damping', v)}
        />
      </div>
      <div className={styles.param}>
        <Knob
          value={params.wet ?? 0.33}
          min={0}
          max={1}
          label="Wet"
          onChange={(v) => handleChange('wet', v)}
        />
      </div>
      <div className={styles.param}>
        <Knob
          value={params.dry ?? 0.7}
          min={0}
          max={1}
          label="Dry"
          onChange={(v) => handleChange('dry', v)}
        />
      </div>
    </div>
  );
}
