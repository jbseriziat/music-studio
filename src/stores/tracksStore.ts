import { create } from 'zustand';
import type { Track, Clip } from '../types/audio';

const MAX_UNDO = 30;

interface Snapshot { tracks: Track[]; clips: Clip[] }

interface TracksState {
  tracks: Track[];
  clips: Clip[];
  selectedClipId: string | null;
  selectedTrackId: string | null;
  /** Pile d'historique (Ctrl+Z). Interne — ne pas modifier directement. */
  _undoHistory: Snapshot[];
  addTrack: (name: string, type: Track['type'], color: string) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  addClip: (clip: Clip) => void;
  removeClip: (id: string) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  moveClip: (clipId: string, newTrackId: string, newPosition: number) => void;
  selectClip: (id: string | null) => void;
  selectTrack: (id: string | null) => void;
  /** Annule la dernière action modifiant les pistes ou clips. */
  undo: () => void;
  /** Remplace entièrement le state pistes+clips (utilisé au chargement de projet). */
  restoreState: (tracks: Track[], clips: Clip[]) => void;
}

const TRACK_COLORS = ['#FF5722', '#2196F3', '#4CAF50', '#9C27B0', '#FF9800', '#00BCD4'];

/** Pousse un snapshot dans l'historique (max 30 entrées). */
function pushSnapshot(s: TracksState): Snapshot[] {
  const snap: Snapshot = { tracks: s.tracks, clips: s.clips };
  const next = [...s._undoHistory, snap];
  return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
}

export const useTracksStore = create<TracksState>()((set) => ({
  tracks: [],
  clips: [],
  selectedClipId: null,
  selectedTrackId: null,
  _undoHistory: [],

  addTrack: (name, type, color) => {
    const id = crypto.randomUUID();
    const newTrack: Track = {
      id, name, type,
      color: color || TRACK_COLORS[0],
      volume: 1.0, pan: 0.0, muted: false, solo: false,
    };
    set((s) => ({
      _undoHistory: pushSnapshot(s),
      tracks: [...s.tracks, newTrack],
    }));
  },

  removeTrack: (id) =>
    set((s) => ({
      _undoHistory: pushSnapshot(s),
      tracks: s.tracks.filter((t) => t.id !== id),
      clips: s.clips.filter((c) => c.trackId !== id),
    })),

  updateTrack: (id, updates) =>
    set((s) => ({
      _undoHistory: pushSnapshot(s),
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  addClip: (clip) =>
    set((s) => ({
      _undoHistory: pushSnapshot(s),
      clips: [...s.clips, clip],
    })),

  removeClip: (id) =>
    set((s) => ({
      _undoHistory: pushSnapshot(s),
      clips: s.clips.filter((c) => c.id !== id),
    })),

  updateClip: (id, updates) =>
    set((s) => ({
      _undoHistory: pushSnapshot(s),
      clips: s.clips.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  moveClip: (clipId, newTrackId, newPosition) =>
    set((s) => ({
      _undoHistory: pushSnapshot(s),
      clips: s.clips.map((c) =>
        c.id === clipId ? { ...c, trackId: newTrackId, position: newPosition } : c
      ),
    })),

  selectClip: (selectedClipId) => set({ selectedClipId }),
  selectTrack: (selectedTrackId) => set({ selectedTrackId }),

  undo: () =>
    set((s) => {
      if (s._undoHistory.length === 0) return {};
      const history = [...s._undoHistory];
      const snap = history.pop()!;
      return { _undoHistory: history, tracks: snap.tracks, clips: snap.clips };
    }),

  restoreState: (tracks, clips) =>
    set({ tracks, clips, selectedClipId: null, selectedTrackId: null, _undoHistory: [] }),
}));
