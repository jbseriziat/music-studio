import { useEffect, useRef } from 'react';
import { AudioSettings } from './AudioSettings';
import styles from './SettingsDialog.module.css';

interface Props {
  onClose: () => void;
}

/**
 * Dialogue de paramètres de l'application.
 * Se ferme sur Escape ou clic en dehors.
 */
export function SettingsDialog({ onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Fermer sur Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fermer au clic sur l'overlay.
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className={styles.overlay} onMouseDown={handleOverlayClick}>
      <div className={styles.dialog} ref={dialogRef}>
        {/* En-tête */}
        <div className={styles.header}>
          <span className={styles.title}>⚙️ Paramètres</span>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer les paramètres"
          >
            ✕
          </button>
        </div>

        {/* Contenu */}
        <div className={styles.body}>
          <AudioSettings />
        </div>
      </div>
    </div>
  );
}
