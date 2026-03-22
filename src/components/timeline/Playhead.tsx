
import styles from './Playhead.module.css';

interface Props {
  positionSecs: number;
  pixelsPerSec: number;
  height: number;
}

export function Playhead({ positionSecs, pixelsPerSec, height }: Props) {
  const left = positionSecs * pixelsPerSec;
  return (
    <div
      className={styles.playhead}
      style={{ left, height }}
      aria-hidden
    />
  );
}
