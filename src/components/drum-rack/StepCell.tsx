import { useCallback } from 'react';
import styles from './StepCell.module.css';

interface Props {
  stepIndex: number;
  active: boolean;
  isCurrent: boolean;
  isDownbeat: boolean;
  color: string;
  velocity: number;
  onToggle: (step: number) => void;
}

export function StepCell({
  stepIndex, active, isCurrent, isDownbeat, color, velocity, onToggle,
}: Props) {
  const handleClick = useCallback(() => onToggle(stepIndex), [onToggle, stepIndex]);

  return (
    <button
      className={[
        styles.cell,
        active ? styles.active : '',
        isCurrent ? styles.current : '',
        isDownbeat ? styles.downbeat : '',
      ].join(' ')}
      style={active ? ({ '--cell-color': color } as React.CSSProperties) : undefined}
      onClick={handleClick}
      aria-pressed={active}
      aria-label={`Step ${stepIndex + 1}`}
      title={active ? `Step ${stepIndex + 1} — vélocité ${Math.round(velocity * 100)}%` : `Step ${stepIndex + 1}`}
    />
  );
}
