import type { AutomationParameter } from '../../stores/automationStore';
import styles from './AutomationSelector.module.css';

interface Props {
  parameter: AutomationParameter;
  onChange?: (param: AutomationParameter) => void;
}

/**
 * Petit sélecteur de paramètre d'automation affiché dans l'entête latérale
 * de la lane d'automation.
 */
export function AutomationSelector({ parameter, onChange }: Props) {
  return (
    <div className={styles.container}>
      <span className={styles.label}>AUTO</span>
      <select
        className={styles.select}
        value={parameter}
        onChange={(e) => onChange?.(e.target.value as AutomationParameter)}
        onClick={(e) => e.stopPropagation()}
      >
        <option value="volume">Volume</option>
        <option value="pan">Pan</option>
      </select>
    </div>
  );
}
