import { useCallback } from 'react';
import styles from './SynthModeUI.module.css';
import { Knob } from '../shared/Knob';
import { useSynthStore, type SynthModeType } from '../../stores/synthStore';

const MODES: { id: SynthModeType; label: string; desc: string }[] = [
  { id: 'poly',   label: 'Poly',   desc: 'Polyphonique (8 voix)' },
  { id: 'mono',   label: 'Mono',   desc: 'Monophonique (retrigger)' },
  { id: 'legato', label: 'Legato', desc: 'Legato (pas de retrigger)' },
];

/**
 * Sélecteur du mode de jeu (Poly/Mono/Legato) + Knob Glide Time.
 */
export function SynthModeUI() {
  const { params, setParam } = useSynthStore();

  const handleMode = useCallback((mode: SynthModeType) => {
    setParam('synth_mode', mode);
  }, [setParam]);

  const handleGlide = useCallback((v: number) => {
    setParam('glide_time', v);
  }, [setParam]);

  return (
    <section className={styles.modeSection}>
      <h3 className={styles.sectionTitle}>Mode</h3>

      <div className={styles.modeButtons}>
        {MODES.map(m => (
          <button
            key={m.id}
            className={`${styles.modeBtn} ${params.synth_mode === m.id ? styles.active : ''}`}
            onClick={() => handleMode(m.id)}
            title={m.desc}
            aria-pressed={params.synth_mode === m.id}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Glide visible only in Mono/Legato */}
      {params.synth_mode !== 'poly' && (
        <div className={styles.glideRow}>
          <Knob
            label="Glide"
            value={params.glide_time}
            min={0}
            max={500}
            defaultValue={0}
            decimals={0}
            unit=" ms"
            size={42}
            onChange={handleGlide}
          />
        </div>
      )}
    </section>
  );
}
