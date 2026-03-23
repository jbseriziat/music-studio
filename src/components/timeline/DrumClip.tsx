import { useDrumStore } from '../../stores/drumStore';
import { useTransportStore } from '../../stores/transportStore';
import styles from './DrumClip.module.css';

interface Props {
  pixelsPerSec: number;
  color: string;
  onDoubleClick?: () => void;
}

/**
 * Visualisation read-only du pattern drum rack dans la timeline.
 * Affiche une mini grille 8×stepCount. Double-clic → ouvre le drum rack.
 */
export function DrumClip({ pixelsPerSec, color, onDoubleClick }: Props) {
  const { steps, stepCount } = useDrumStore();
  const bpm = useTransportStore((s) => s.bpm);

  // Durée d'un cycle complet en secondes : stepCount doubles-croches à bpm BPM.
  // 1 beat = 60/bpm s ; 1 step = 1/4 beat → stepCount steps = (stepCount/4) beats.
  const patternDurationSecs = (stepCount / 4) * (60 / bpm);
  const width = Math.max(patternDurationSecs * pixelsPerSec, 80);

  return (
    <div
      className={styles.drumClip}
      style={{ width, borderColor: color }}
      onDoubleClick={onDoubleClick}
      title="Drum Rack — double-clic pour éditer"
    >
      <span className={styles.label}>🥁 Drum</span>
      <div className={styles.miniGrid}>
        {steps.slice(0, 8).map((padSteps, padIdx) => (
          <div key={padIdx} className={styles.miniRow}>
            {padSteps.slice(0, stepCount).map((active, stepIdx) => (
              <div
                key={stepIdx}
                className={`${styles.miniCell} ${active ? styles.active : ''}`}
                style={active ? { background: color } : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
