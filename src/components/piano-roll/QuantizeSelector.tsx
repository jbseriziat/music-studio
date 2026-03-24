import styles from './QuantizeSelector.module.css';
import { usePianoRollStore } from '../../stores/pianoRollStore';
import type { Quantize } from '../../stores/pianoRollStore';

const OPTIONS: { label: string; value: Quantize }[] = [
  { label: '1/4', value: 0.25 },
  { label: '1/8', value: 0.125 },
  { label: '1/16', value: 0.0625 },
];

/**
 * Sélecteur de quantification (snap des notes sur la grille).
 */
export function QuantizeSelector() {
  const { quantize, setQuantize } = usePianoRollStore();

  return (
    <div className={styles.selector}>
      <span className={styles.label}>Snap</span>
      {OPTIONS.map(opt => (
        <button
          key={opt.label}
          className={`${styles.btn} ${quantize === opt.value ? styles.active : ''}`}
          onClick={() => setQuantize(opt.value)}
          title={`Quantification ${opt.label}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
