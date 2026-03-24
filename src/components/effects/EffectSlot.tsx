import { useCallback } from 'react';
import { useEffectsStore, type EffectSlotState } from '../../stores/effectsStore';
import { removeEffect, setEffectBypass } from '../../utils/tauri-commands';
import { ReverbUI } from './ReverbUI';
import { DelayUI } from './DelayUI';
import { EqUI } from './EqUI';
import { CompressorUI } from './CompressorUI';
import styles from './EffectSlot.module.css';

interface EffectSlotProps {
  trackId: string;
  slot: EffectSlotState;
}

const EFFECT_LABELS: Record<string, string> = {
  reverb: 'Reverb',
  delay: 'Delay',
  eq: 'EQ',
  compressor: 'Comp',
};

export function EffectSlot({ trackId, slot }: EffectSlotProps) {
  const removeSlot = useEffectsStore((s) => s.removeEffect);
  const setBypass = useEffectsStore((s) => s.setEffectBypass);

  const handleBypass = useCallback(() => {
    const newBypass = !slot.bypass;
    setBypass(trackId, slot.id, newBypass);
    setEffectBypass(Number(trackId), slot.id, newBypass).catch(console.error);
  }, [trackId, slot.id, slot.bypass, setBypass]);

  const handleRemove = useCallback(() => {
    removeSlot(trackId, slot.id);
    removeEffect(Number(trackId), slot.id).catch(console.error);
  }, [trackId, slot.id, removeSlot]);

  return (
    <div className={`${styles.slot} ${slot.bypass ? styles.bypassed : ''}`}>
      <div className={styles.header}>
        <span className={styles.name}>{EFFECT_LABELS[slot.type] ?? slot.type}</span>
        <button
          className={`${styles.btn} ${slot.bypass ? styles.active : ''}`}
          onClick={handleBypass}
          title={slot.bypass ? 'Réactiver' : 'Bypass'}
        >
          B
        </button>
        <button className={styles.btn} onClick={handleRemove} title="Supprimer">
          ✕
        </button>
      </div>
      {!slot.bypass && (
        <div className={styles.params}>
          {slot.type === 'reverb' && (
            <ReverbUI trackId={trackId} effectId={slot.id} params={slot.params} />
          )}
          {slot.type === 'delay' && (
            <DelayUI trackId={trackId} effectId={slot.id} params={slot.params} />
          )}
          {slot.type === 'eq' && (
            <EqUI trackId={trackId} effectId={slot.id} params={slot.params} />
          )}
          {slot.type === 'compressor' && (
            <CompressorUI trackId={trackId} effectId={slot.id} params={slot.params} />
          )}
        </div>
      )}
    </div>
  );
}
