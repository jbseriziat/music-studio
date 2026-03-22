
import styles from './PlayButton.module.css';

interface Props {
  isPlaying: boolean;
  onPlay: () => void;
}

export function PlayButton({ isPlaying, onPlay }: Props) {
  return (
    <button
      className={`${styles.btn} ${isPlaying ? styles.active : ''}`}
      onClick={onPlay}
      title="Jouer"
      aria-label="Jouer"
    >
      ▶
    </button>
  );
}
