
import styles from './BpmControl.module.css';

interface Props {
  bpm: number;
  onChange: (bpm: number) => void;
}

function bpmEmoji(bpm: number): string {
  if (bpm < 80) return '🐢';
  if (bpm < 120) return '🚶';
  if (bpm < 160) return '🏃';
  return '🚀';
}

export function BpmControl({ bpm, onChange }: Props) {
  return (
    <div className={styles.control}>
      <span className={styles.emoji}>{bpmEmoji(bpm)}</span>
      <button className={styles.btn} onClick={() => onChange(Math.max(40, bpm - 1))}>−</button>
      <span className={styles.value}>{bpm}</span>
      <button className={styles.btn} onClick={() => onChange(Math.min(240, bpm + 1))}>+</button>
      <span className={styles.label}>BPM</span>
    </div>
  );
}
