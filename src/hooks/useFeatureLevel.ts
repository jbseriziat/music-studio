import { useSettingsStore } from '../stores/settingsStore';
import type { FeatureLevel } from '../types/levels';

/**
 * Hook central du système de niveaux.
 * Détermine si un composant ou une fonctionnalité doit s'afficher
 * en fonction du niveau du profil actif.
 *
 * Usage :
 *   const { isVisible } = useFeatureLevel();
 *   {isVisible(2) && <TempoControl />}
 */
export function useFeatureLevel() {
  const currentLevel = useSettingsStore((s) => s.currentLevel);

  const isVisible = (requiredLevel: FeatureLevel): boolean =>
    currentLevel >= requiredLevel;

  const isEnabled = (requiredLevel: FeatureLevel): boolean =>
    currentLevel >= requiredLevel;

  return { currentLevel, isVisible, isEnabled };
}
