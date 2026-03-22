import styles from './TimeDisplay.module.css';

interface Props {
  positionSecs: number;
}

function formatMmSs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TimeDisplay({ positionSecs }: Props) {
  return (
    <div className={styles.display}>
      {formatMmSs(positionSecs)}
    </div>
  );
}
