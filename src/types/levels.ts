export type FeatureLevel = 1 | 2 | 3 | 4 | 5;

export interface LevelConfig {
  level: FeatureLevel;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export const LEVEL_CONFIGS: LevelConfig[] = [
  { level: 1, label: 'Découverte',       description: 'Pads sonores et timeline simple',  icon: '🎒', color: '#4CAF50' },
  { level: 2, label: 'Petit Producteur', description: 'Boîte à rythmes et séquenceur',    icon: '🥁', color: '#2196F3' },
  { level: 3, label: 'Mélodiste',        description: 'Piano roll et premiers synthés',   icon: '🎹', color: '#9C27B0' },
  { level: 4, label: 'Studio',           description: 'Mixage, effets et enregistrement', icon: '🎛️', color: '#FF9800' },
  { level: 5, label: 'Producteur Pro',   description: 'Synthèse avancée et mastering',    icon: '🚀', color: '#F44336' },
];
