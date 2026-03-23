import { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { listDrumKits, type DrumKitInfo } from '../../utils/tauri-commands';
import { useDrumStore } from '../../stores/drumStore';
import styles from './DrumKitSelector.module.css';

/**
 * Sélecteur de kit de batterie.
 * Affiche un dropdown avec les kits intégrés (Default, Hip-Hop, Rock, Electronic, Fun Kids).
 * La sélection charge le kit via le store (IPC vers le moteur audio).
 */
export function DrumKitSelector() {
  const [kits, setKits] = useState<DrumKitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { loadKit } = useDrumStore();

  useEffect(() => {
    listDrumKits()
      .then(setKits)
      .catch(() => {});
  }, []);

  const handleSelect = async (kitName: string) => {
    setLoading(true);
    try {
      await loadKit(kitName);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={styles.trigger}
          disabled={loading}
          title="Choisir un kit de batterie"
        >
          {loading ? '⌛' : '🎹'} Kit
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.content}
          sideOffset={4}
          align="start"
        >
          {kits.map((kit) => (
            <DropdownMenu.Item
              key={kit.name}
              className={styles.item}
              onSelect={() => handleSelect(kit.name)}
            >
              {kit.display_name}
            </DropdownMenu.Item>
          ))}

          {kits.length === 0 && (
            <div className={styles.empty}>Chargement…</div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
