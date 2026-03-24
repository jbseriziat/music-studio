import { useCallback } from 'react';
import { useEffectsStore, type EffectType } from '../../stores/effectsStore';
import { addEffect } from '../../utils/tauri-commands';
import { EffectSlot } from './EffectSlot';
import styles from './EffectRack.module.css';

interface EffectRackProps {
  trackId: string;
}

const EFFECT_OPTIONS: { type: EffectType; label: string }[] = [
  { type: 'reverb',     label: '+ Reverb' },
  { type: 'delay',      label: '+ Delay' },
  { type: 'eq',         label: '+ EQ' },
  { type: 'compressor', label: '+ Comp' },
];

// Paramètres par défaut pour l'initialisation côté store.
const DEFAULT_PARAMS: Record<EffectType, Record<string, number>> = {
  reverb:     { room_size: 0.5, damping: 0.5, wet: 0.33, dry: 0.7 },
  delay:      { time_ms: 375, feedback: 0.4, wet: 0.3, dry: 1.0 },
  eq:         { low_gain: 0, low_freq: 200, low_q: 0.7,
                mid_gain: 0, mid_freq: 1000, mid_q: 1.0,
                high_gain: 0, high_freq: 5000, high_q: 0.7 },
  compressor: { threshold: -20, ratio: 4, attack: 10, release: 100, makeup: 0 },
};

export function EffectRack({ trackId }: EffectRackProps) {
  const slots = useEffectsStore((s) => s.trackEffects[trackId] ?? []);
  const addSlot = useEffectsStore((s) => s.addEffect);

  const handleAdd = useCallback(
    (type: EffectType) => {
      addEffect(Number(trackId), type)
        .then((effectId) => {
          addSlot(trackId, {
            id: effectId,
            type,
            bypass: false,
            params: { ...DEFAULT_PARAMS[type] },
          });
        })
        .catch(console.error);
    },
    [trackId, addSlot],
  );

  return (
    <div className={styles.rack}>
      {slots.map((slot) => (
        <EffectSlot key={slot.id} trackId={trackId} slot={slot} />
      ))}
      <div className={styles.addRow}>
        {EFFECT_OPTIONS.map(({ type, label }) => (
          <button key={type} className={styles.addBtn} onClick={() => handleAdd(type)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
