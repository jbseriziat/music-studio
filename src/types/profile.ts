import type { FeatureLevel } from './levels';

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;        // emoji ou chemin d'image
  level: FeatureLevel;
  parentCode?: string;   // code simple pour accéder aux niveaux 4-5
  theme: 'light' | 'dark' | 'colorful';
  createdAt: string;     // ISO 8601
}
