import type { ReactNode } from 'react';
import type { FeatureLevel } from '../../types/levels';
import { useFeatureLevel } from '../../hooks/useFeatureLevel';

interface LevelGateProps {
  /** Niveau minimum requis pour afficher le contenu */
  level: FeatureLevel;
  children: ReactNode;
  /** Contenu affiché si le niveau est insuffisant (défaut : rien) */
  fallback?: ReactNode;
}

/**
 * Wrapper qui affiche ses children uniquement si le niveau courant
 * est >= au niveau requis.
 *
 * Usage :
 *   <LevelGate level={2}><DrumRack /></LevelGate>
 *   <LevelGate level={4} fallback={<p>Fonctionnalité Studio</p>}><RecordButton /></LevelGate>
 */
export function LevelGate({ level, children, fallback = null }: LevelGateProps) {
  const { isVisible } = useFeatureLevel();

  if (!isVisible(level)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
