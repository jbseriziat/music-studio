import { create } from 'zustand';
import type { Project } from '../types/project';

interface ProjectState {
  currentProject: Project | null;
  isDirty: boolean;           // modifications non sauvegardées
  lastSavedAt: string | null;
  // Actions
  setProject: (project: Project) => void;
  markDirty: () => void;
  markSaved: () => void;
  clearProject: () => void;
}

export const useProjectStore = create<ProjectState>()((set) => ({
  currentProject: null,
  isDirty: false,
  lastSavedAt: null,

  setProject: (project) => set({ currentProject: project, isDirty: false }),
  markDirty: () => set({ isDirty: true }),
  markSaved: () => set({ isDirty: false, lastSavedAt: new Date().toISOString() }),
  clearProject: () => set({ currentProject: null, isDirty: false, lastSavedAt: null }),
}));
