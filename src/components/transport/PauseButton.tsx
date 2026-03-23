import styles from './PauseButton.module.css';

interface Props {
  isPlaying: boolean;
  onPause: () => void;
}

/** Bouton Pause — visible à partir du niveau 2 (LevelGate dans TransportBar). */
export function PauseButton({ isPlaying, onPause }: Props) {
  return (
    <button
      className={styles.btn}
      onClick={onPause}
      disabled={!isPlaying}
      title="Pause"
      aria-label="Pause"
    >
      ⏸
    </button>
  );
}
