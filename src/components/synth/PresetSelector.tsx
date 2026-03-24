import { useCallback } from 'react';
import styles from './PresetSelector.module.css';
import { useSynthStore } from '../../stores/synthStore';

/**
 * Sélecteur de presets — navigation ◀ ▶ + dropdown.
 */
export function PresetSelector() {
  const { presets, activePresetName, loadPreset } = useSynthStore();

  const currentIndex = presets.findIndex(p => p.name === activePresetName);

  const handlePrev = useCallback(() => {
    if (presets.length === 0) return;
    const idx = currentIndex <= 0 ? presets.length - 1 : currentIndex - 1;
    loadPreset(presets[idx].name).catch(console.error);
  }, [presets, currentIndex, loadPreset]);

  const handleNext = useCallback(() => {
    if (presets.length === 0) return;
    const idx = currentIndex < 0 || currentIndex >= presets.length - 1 ? 0 : currentIndex + 1;
    loadPreset(presets[idx].name).catch(console.error);
  }, [presets, currentIndex, loadPreset]);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (name) loadPreset(name).catch(console.error);
  }, [loadPreset]);

  return (
    <div className={styles.presetSelector}>
      <span className={styles.label}>Preset</span>

      <div className={styles.controls}>
        <button
          className={styles.navBtn}
          onClick={handlePrev}
          disabled={presets.length === 0}
          aria-label="Preset précédent"
          title="Preset précédent"
        >◀</button>

        <select
          className={styles.dropdown}
          value={activePresetName ?? ''}
          onChange={handleSelect}
          aria-label="Sélectionner un preset"
        >
          {!activePresetName && (
            <option value="" disabled>— Personnalisé —</option>
          )}
          {presets.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>

        <button
          className={styles.navBtn}
          onClick={handleNext}
          disabled={presets.length === 0}
          aria-label="Preset suivant"
          title="Preset suivant"
        >▶</button>
      </div>

      {!activePresetName && (
        <span className={styles.customBadge}>✦ Personnalisé</span>
      )}
    </div>
  );
}
