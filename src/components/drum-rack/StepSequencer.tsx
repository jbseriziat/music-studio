import { useDrumStore } from '../../stores/drumStore';
import { StepRow } from './StepRow';
import styles from './StepSequencer.module.css';

/**
 * Grille de séquenceur : 8 rangées (pads) × N colonnes (steps).
 * Chaque rangée affiche un bouton pad et ses steps.
 */
export function StepSequencer() {
  const { pads, steps, velocities, stepCount, currentStep } = useDrumStore();

  return (
    <div className={styles.grid}>
      {pads.map((pad, padIdx) => (
        <StepRow
          key={padIdx}
          padIndex={padIdx}
          padName={pad.sampleName}
          padIcon={pad.icon}
          padColor={pad.color}
          steps={steps[padIdx].slice(0, stepCount)}
          velocities={velocities[padIdx].slice(0, stepCount)}
          stepCount={stepCount}
          currentStep={currentStep}
        />
      ))}
    </div>
  );
}
