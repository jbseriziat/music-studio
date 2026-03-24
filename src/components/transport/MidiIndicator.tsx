import { useState, useCallback, useEffect, useRef } from 'react';
import { useMidi } from '../../hooks/useMidi';
import styles from './MidiIndicator.module.css';

/**
 * Indicateur MIDI dans la barre de transport (niveau 3+).
 *
 * - Affiche le statut de connexion MIDI avec un point clignotant.
 * - Dropdown pour lister et connecter/déconnecter les périphériques.
 */
export function MidiIndicator() {
  const { devices, connectedDevice, isActive, listDevices, connect, disconnect } =
    useMidi();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermer le dropdown si on clique ailleurs
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleToggle = useCallback(async () => {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening) {
      await listDevices();
    }
  }, [isOpen, listDevices]);

  const handleDevice = useCallback(
    async (deviceName: string) => {
      if (connectedDevice === deviceName) {
        await disconnect();
      } else {
        await connect(deviceName);
      }
    },
    [connectedDevice, connect, disconnect],
  );

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        className={`${styles.btn} ${isActive ? styles.btnActive : ''}`}
        onClick={handleToggle}
        title={isActive ? `MIDI : ${connectedDevice}` : 'Cliquer pour gérer les périphériques MIDI'}
        aria-expanded={isOpen}
      >
        <span className={`${styles.dot} ${isActive ? styles.dotActive : ''}`} />
        MIDI
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="menu">
          <p className={styles.label}>Entrées MIDI</p>

          {devices.length === 0 ? (
            <p className={styles.empty}>Aucun périphérique détecté</p>
          ) : (
            devices.map((d) => (
              <button
                key={d.name}
                className={`${styles.device} ${connectedDevice === d.name ? styles.deviceConnected : ''}`}
                onClick={() => handleDevice(d.name)}
                role="menuitem"
              >
                {connectedDevice === d.name ? '✅' : '⭕'} {d.name}
              </button>
            ))
          )}

          <button className={styles.refresh} onClick={listDevices}>
            🔄 Rafraîchir
          </button>
        </div>
      )}
    </div>
  );
}
