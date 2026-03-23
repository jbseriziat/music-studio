import { useDrumStore } from '../../stores/drumStore';
import { useTransportStore } from '../../stores/transportStore';
import { StepRow } from './StepRow';
import { StepCursor } from './StepCursor';
import styles from './StepSequencer.module.css';

/**
 * Grille de séquenceur : 8 rangées (pads) × N colonnes (steps).
 * Chaque rangée affiche un bouton pad et ses steps.
 * Le StepCursor est un overlay absolu qui indique le step en cours.
 */
export function StepSequencer() {
  const { pads, steps, velocities, stepCount, currentStep } = useDrumStore();
  const isPlaying = useTransportStore((s) => s.isPlaying);

  return (
    <div className={styles.grid}>
      {/* ─── Curseur de lecture (overlay absolu) ─────────────────────────── */}
      <StepCursor stepIndex={currentStep} visible={isPlaying} />

      {/* ─── Rangées de steps ────────────────────────────────────────────── */}
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
