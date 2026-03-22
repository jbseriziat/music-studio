
import styles from './AddTrackButton.module.css';

interface Props {
  onClick: () => void;
  disabled?: boolean;
}

export function AddTrackButton({ onClick, disabled }: Props) {
  return (
    <button
      className={styles.btn}
      onClick={onClick}
      disabled={disabled}
      title="Ajouter une piste"
    >
      + Nouvelle piste
    </button>
  );
}
