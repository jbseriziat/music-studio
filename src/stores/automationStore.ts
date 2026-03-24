import { create } from 'zustand';
import {
  addAutomationPoint as addPointCmd,
  updateAutomationPoint as updatePointCmd,
  deleteAutomationPoint as deletePointCmd,
} from '../utils/tauri-commands';
import { useTracksStore } from './tracksStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutomationPoint {
  id: number;
  timeBeats: number;
  value: number;  // 0.0–1.0 normalisé
}

export type AutomationParameter = 'volume' | 'pan';

// Clé : "${trackId}:${parameter}"
type AutomationMap = Record<string, AutomationPoint[]>;

// ─── Store ────────────────────────────────────────────────────────────────────

interface AutomationState {
  lanes: AutomationMap;

  /** Retourne les points d'une lane (triés par timeBeats). */
  getPoints: (trackId: string, parameter: AutomationParameter) => AutomationPoint[];

  /** Écrase directement les points (utilisé au chargement de projet). */
  setPoints: (trackId: string, parameter: AutomationParameter, points: AutomationPoint[]) => void;

  /** Supprime toutes les lanes (nouveau projet, fermeture). */
  clearAll: () => void;

  /** Supprime les lanes d'une piste (suppression de piste). */
  clearTrack: (trackId: string) => void;

  /** Ajoute un point, appelle le backend et met à jour le store. */
  addPoint: (trackId: string, parameter: AutomationParameter, timeBeats: number, value: number) => Promise<void>;

  /** Met à jour un point, appelle le backend et met à jour le store. */
  updatePoint: (trackId: string, parameter: AutomationParameter, pointId: number, timeBeats: number, value: number) => Promise<void>;

  /** Supprime un point, appelle le backend et met à jour le store. */
  deletePoint: (trackId: string, parameter: AutomationParameter, pointId: number) => Promise<void>;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function laneKey(trackId: string, parameter: AutomationParameter): string {
  return `${trackId}:${parameter}`;
}

/** Résout l'UUID frontend en index numérique 0-based pour les commandes Tauri. */
function resolveTrackIndex(trackId: string): number {
  return useTracksStore.getState().tracks.findIndex((t) => t.id === trackId);
}

// ─── Implémentation ───────────────────────────────────────────────────────────

export const useAutomationStore = create<AutomationState>()((set, get) => ({
  lanes: {},

  getPoints: (trackId, parameter) => {
    return get().lanes[laneKey(trackId, parameter)] ?? [];
  },

  setPoints: (trackId, parameter, points) => {
    const key = laneKey(trackId, parameter);
    set((s) => ({ lanes: { ...s.lanes, [key]: [...points].sort((a, b) => a.timeBeats - b.timeBeats) } }));
  },

  clearAll: () => set({ lanes: {} }),

  clearTrack: (trackId) => {
    set((s) => {
      const next: AutomationMap = {};
      for (const [k, v] of Object.entries(s.lanes)) {
        if (!k.startsWith(`${trackId}:`)) next[k] = v;
      }
      return { lanes: next };
    });
  },

  addPoint: async (trackId, parameter, timeBeats, value) => {
    const idx = resolveTrackIndex(trackId);
    if (idx < 0) return;

    const pointId = await addPointCmd(idx, parameter, timeBeats, value);

    const key = laneKey(trackId, parameter);
    set((s) => {
      const existing = s.lanes[key] ?? [];
      const next = [...existing, { id: pointId, timeBeats, value }]
        .sort((a, b) => a.timeBeats - b.timeBeats);
      return { lanes: { ...s.lanes, [key]: next } };
    });
  },

  updatePoint: async (trackId, parameter, pointId, timeBeats, value) => {
    const idx = resolveTrackIndex(trackId);
    if (idx < 0) return;

    await updatePointCmd(idx, parameter, pointId, timeBeats, value);

    const key = laneKey(trackId, parameter);
    set((s) => {
      const existing = s.lanes[key] ?? [];
      const next = existing
        .map((p) => (p.id === pointId ? { ...p, timeBeats, value } : p))
        .sort((a, b) => a.timeBeats - b.timeBeats);
      return { lanes: { ...s.lanes, [key]: next } };
    });
  },

  deletePoint: async (trackId, parameter, pointId) => {
    const idx = resolveTrackIndex(trackId);
    if (idx < 0) return;

    await deletePointCmd(idx, parameter, pointId);

    const key = laneKey(trackId, parameter);
    set((s) => {
      const existing = s.lanes[key] ?? [];
      return { lanes: { ...s.lanes, [key]: existing.filter((p) => p.id !== pointId) } };
    });
  },
}));
