import styles from './RecordButton.module.css';

interface Props {
  isRecording: boolean;
  onToggle: () => void;
}

/** Bouton Enregistrement — visible à partir du niveau 4 (LevelGate dans TransportBar). */
export function RecordButton({ isRecording, onToggle }: Props) {
  return (
    <button
      className={`${styles.btn} ${isRecording ? styles.active : ''}`}
      onClick={onToggle}
      title={isRecording ? "Arrêter l'enregistrement" : 'Enregistrer'}
      aria-label={isRecording ? "Arrêter l'enregistrement" : 'Enregistrer'}
      aria-pressed={isRecording}
    >
      ●
    </button>
  );
}
