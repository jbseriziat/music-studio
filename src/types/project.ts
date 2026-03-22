import type { FeatureLevel } from './levels';

// Piste dans le fichier .msp
export interface ProjectTrack {
  id: number;
  name: string;
  type: 'audio' | 'drum_rack' | 'instrument';
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  clips: unknown[];    // AudioClip[] — structuré en Phase 1+
  patterns: unknown[]; // DrumPattern[] — structuré en Phase 2+
  effects: unknown[];  // Effect[] — structuré en Phase 4+
  levelRequired: FeatureLevel;
}

export interface ProjectMaster {
  volume: number;
  effects: unknown[];
}

// Format de projet Music Studio (.msp = JSON)
export interface Project {
  version: string;
  name: string;
  createdBy: string;  // id du profil auteur
  bpm: number;
  timeSignature: [number, number];
  sampleRate: number;
  tracks: ProjectTrack[];
  master: ProjectMaster;
  createdAt: string;  // ISO 8601
  updatedAt: string;
}
