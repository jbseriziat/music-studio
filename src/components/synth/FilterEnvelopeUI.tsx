import { useCallback } from 'react';
import styles from './EnvelopeUI.module.css';
import { Knob } from '../shared/Knob';
import { useSynthStore } from '../../stores/synthStore';

/**
 * Enveloppe de filtre (Phase 5.2) — mêmes contrôles ADSR que l'enveloppe d'amplitude,
 * plus un knob Amount pour doser la modulation du cutoff.
 */
export function FilterEnvelopeUI() {
  const { params, setParam } = useSynthStore();

  const handleAmount  = useCallback((v: number) => setParam('filter_env_amount',  v), [setParam]);
  const handleAttack  = useCallback((v: number) => setParam('filter_env_attack',  v), [setParam]);
  const handleDecay   = useCallback((v: number) => setParam('filter_env_decay',   v), [setParam]);
  const handleSustain = useCallback((v: number) => setParam('filter_env_sustain', v), [setParam]);
  const handleRelease = useCallback((v: number) => setParam('filter_env_release', v), [setParam]);

  return (
    <section className={styles.envelopeSection}>
      <h3 className={styles.sectionTitle}>Enveloppe Filtre</h3>

      <div className={styles.knobRow}>
        <Knob
          label="Amount"
          value={params.filter_env_amount}
          min={0}
          max={1}
          defaultValue={0}
          decimals={2}
          size={44}
          onChange={handleAmount}
        />
        <Knob
          label="Attack"
          value={params.filter_env_attack}
          min={0.001}
          max={5}
          defaultValue={0.005}
          unit=" s"
          decimals={3}
          size={44}
          onChange={handleAttack}
        />
        <Knob
          label="Decay"
          value={params.filter_env_decay}
          min={0.001}
          max={5}
          defaultValue={0.200}
          unit=" s"
          decimals={3}
          size={44}
          onChange={handleDecay}
        />
        <Knob
          label="Sustain"
          value={params.filter_env_sustain}
          min={0}
          max={1}
          defaultValue={0}
          decimals={2}
          size={44}
          onChange={handleSustain}
        />
        <Knob
          label="Release"
          value={params.filter_env_release}
          min={0.001}
          max={10}
          defaultValue={0.300}
          unit=" s"
          decimals={3}
          size={44}
          onChange={handleRelease}
        />
      </div>
    </section>
  );
}
