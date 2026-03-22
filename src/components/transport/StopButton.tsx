
import styles from './StopButton.module.css';

interface Props {
  onStop: () => void;
}

export function StopButton({ onStop }: Props) {
  return (
    <button
      className={styles.btn}
      onClick={onStop}
      title="Stop"
      aria-label="Stop"
    >
      ■
    </button>
  );
}
