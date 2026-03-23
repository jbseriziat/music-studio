import styles from './LoopButton.module.css';

interface Props {
  enabled: boolean;
  onToggle: () => void;
}

/** Bouton Boucle (Loop) — visible à partir du niveau 2 (LevelGate dans TransportBar). */
export function LoopButton({ enabled, onToggle }: Props) {
  return (
    <button
      className={`${styles.btn} ${enabled ? styles.active : ''}`}
      onClick={onToggle}
      title={enabled ? 'Désactiver la boucle' : 'Activer la boucle'}
      aria-label={enabled ? 'Désactiver la boucle' : 'Activer la boucle'}
      aria-pressed={enabled}
    >
      🔁
    </button>
  );
}
