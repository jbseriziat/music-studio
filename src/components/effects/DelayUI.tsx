import { useCallback } from 'react';
import { Knob } from '../shared/Knob';
import { setEffectParam } from '../../utils/tauri-commands';
import { useEffectsStore } from '../../stores/effectsStore';
import styles from './EffectUI.module.css';

interface DelayUIProps {
  trackId: string;
  effectId: number;
  params: Record<string, number>;
}

export function DelayUI({ trackId, effectId, params }: DelayUIProps) {
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
          value={(params.time_ms ?? 375) / 2000}
          min={0}
          max={1}
          label="Time"
          onChange={(v) => handleChange('time_ms', v * 2000)}
        />
        <span className={styles.paramValue}>{Math.round(params.time_ms ?? 375)}ms</span>
      </div>
      <div className={styles.param}>
        <Knob
          value={params.feedback ?? 0.4}
          min={0}
          max={1}
          label="Fdbk"
          onChange={(v) => handleChange('feedback', Math.min(v, 0.95))}
        />
      </div>
      <div className={styles.param}>
        <Knob
          value={params.wet ?? 0.3}
          min={0}
          max={1}
          label="Wet"
          onChange={(v) => handleChange('wet', v)}
        />
      </div>
      <div className={styles.param}>
        <Knob
          value={params.dry ?? 1.0}
          min={0}
          max={1}
          label="Dry"
          onChange={(v) => handleChange('dry', v)}
        />
      </div>
    </div>
  );
}
