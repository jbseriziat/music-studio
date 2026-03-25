import styles from './MasteringPanel.module.css';

interface Props {
  momentary: number;
  shortterm: number;
  integrated: number;
  truePeakDb: number;
}

const TARGET_LUFS = -14;

function lufsColor(lufs: number): string {
  if (lufs < -70) return '#555';
  const diff = Math.abs(lufs - TARGET_LUFS);
  if (diff < 2) return '#4CAF50';
  if (diff < 5) return '#FF9800';
  return '#f44336';
}

/**
 * Affichage LUFS : Momentary, Short-term, Integrated + True Peak.
 * Cible -14 LUFS comme référence streaming.
 */
export function LoudnessMeter({ momentary, shortterm, integrated, truePeakDb }: Props) {
  return (
    <div className={styles.loudnessSection}>
      <h4 className={styles.subTitle}>Loudness (LUFS)</h4>
      <div className={styles.lufsGrid}>
        <div className={styles.lufsItem}>
          <span className={styles.lufsLabel}>M</span>
          <span className={styles.lufsValue} style={{ color: lufsColor(momentary) }}>
            {momentary > -70 ? momentary.toFixed(1) : '—'}
          </span>
        </div>
        <div className={styles.lufsItem}>
          <span className={styles.lufsLabel}>S</span>
          <span className={styles.lufsValue} style={{ color: lufsColor(shortterm) }}>
            {shortterm > -70 ? shortterm.toFixed(1) : '—'}
          </span>
        </div>
        <div className={styles.lufsItem}>
          <span className={styles.lufsLabel}>I</span>
          <span className={styles.lufsValue} style={{ color: lufsColor(integrated) }}>
            {integrated > -70 ? integrated.toFixed(1) : '—'}
          </span>
        </div>
        <div className={styles.lufsItem}>
          <span className={styles.lufsLabel}>TP</span>
          <span className={styles.lufsValue} style={{ color: truePeakDb > -1 ? '#f44336' : '#aaa' }}>
            {truePeakDb > -70 ? `${truePeakDb.toFixed(1)} dB` : '—'}
          </span>
        </div>
      </div>
      <div className={styles.lufsTarget}>Cible : {TARGET_LUFS} LUFS</div>
    </div>
  );
}
