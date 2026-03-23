import { useCallback } from 'react';
import { useDrumStore } from '../../stores/drumStore';
import { DrumPad } from './DrumPad';
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
  const { toggleStep, padVolumes, padPitches } = useDrumStore();

  const volume = padVolumes[padIndex] ?? 1.0;
  const pitch  = padPitches[padIndex] ?? 0.0;

  const handleStepClick = useCallback((stepIdx: number) => {
    toggleStep(padIndex, stepIdx);
  }, [toggleStep, padIndex]);

  return (
    <div className={styles.row}>
      {/* ─── Pad : déclenchement + réglages (volume, pitch, sample) ────── */}
      <DrumPad
        padIndex={padIndex}
        padName={padName}
        padIcon={padIcon}
        padColor={padColor}
        volume={volume}
        pitch={pitch}
      />

      {/* ─── Cellules de step ─────────────────────────────────────────── */}
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
