import { useCallback } from 'react';
import { useDrumStore } from '../../stores/drumStore';
import { StepCell } from './StepCell';
import styles from './StepRow.module.css';

interface Props {
  padIndex: number;
  padName: string;
  padIcon: string;
  padColor: string;
  steps: boolean[];
  velocities: number[];
  stepCount: number;
  currentStep: number;
}

export function StepRow({
  padIndex, padName, padIcon, padColor,
  steps, velocities, stepCount, currentStep,
}: Props) {
  const { triggerPad, toggleStep } = useDrumStore();

  const handlePadClick = useCallback(() => {
    triggerPad(padIndex);
  }, [triggerPad, padIndex]);

  const handleStepClick = useCallback((stepIdx: number) => {
    toggleStep(padIndex, stepIdx);
  }, [toggleStep, padIndex]);

  return (
    <div className={styles.row}>
      {/* ─── Bouton pad ─────────────────────────────────────────────────── */}
      <button
        className={styles.padBtn}
        style={{ '--pad-color': padColor } as React.CSSProperties}
        onClick={handlePadClick}
        title={`Jouer ${padName}`}
        aria-label={padName}
      >
        <span className={styles.padIcon}>{padIcon}</span>
        <span className={styles.padName}>{padName}</span>
      </button>

      {/* ─── Cellules de step ───────────────────────────────────────────── */}
      <div className={styles.cells}>
        {Array.from({ length: stepCount }, (_, i) => (
          <StepCell
            key={i}
            stepIndex={i}
            active={steps[i] ?? false}
            isCurrent={i === currentStep}
            isDownbeat={i % 4 === 0}
            color={padColor}
            velocity={velocities[i] ?? 1.0}
            onToggle={handleStepClick}
          />
        ))}
      </div>
    </div>
  );
}
