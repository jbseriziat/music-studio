import styles from './MetronomeToggle.module.css';

interface Props {
  enabled: boolean;
  onToggle: () => void;
}

/** Bouton Métronome — visible à partir du niveau 2 (LevelGate dans TransportBar). */
export function MetronomeToggle({ enabled, onToggle }: Props) {
  return (
    <button
      className={`${styles.btn} ${enabled ? styles.active : ''}`}
      onClick={onToggle}
      title={enabled ? 'Désactiver le métronome' : 'Activer le métronome'}
      aria-label={enabled ? 'Désactiver le métronome' : 'Activer le métronome'}
      aria-pressed={enabled}
    >
      🎵
    </button>
  );
}
