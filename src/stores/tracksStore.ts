import { create } from 'zustand';
import type { Track, Clip } from '../types/audio';

const MAX_UNDO = 30;

interface Snapshot { tracks: Track[]; clips: Clip[] }

interface TracksState {
  tracks: Track[];
  clips: Clip[];
  selectedClipId: string | null;
  selectedTrackId: string | null;
  /** Pile d'historique Undo (Ctrl+Z). Interne — ne pas modifier directement. */
  _undoHistory: Snapshot[];
  /** Pile d'historique Redo (Ctrl+Y). Interne — ne pas modifier directement. */
  _redoHistory: Snapshot[];
  /** Presse-papier pour Copier/Coller un clip. */
  _clipboard: Clip | null;

  addTrack: (name: string, type: Track['type'], color: string) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  addClip: (clip: Clip) => void;
  removeClip: (id: string) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  moveClip: (clipId: string, newTrackId: string, newPosition: number) => void;
  selectClip: (id: string | null) => void;
  selectTrack: (id: string | null) => void;
  /** Annule la dernière action (Ctrl+Z). */
  undo: () => void;
  /** Rétablit la dernière action annulée (Ctrl+Y). */
  redo: () => void;
  /** Copie le clip dans le presse-papier. */
  copyClip: (id: string) => void;
  /** Colle le clip du presse-papier, légèrement décalé. */
  pasteClip: () => void;
  /** Duplique un clip et le place juste après l'original. */
  duplicateClip: (id: string) => void;
  /** Remplace entièrement le state pistes+clips (utilisé au chargement de projet). */
  restoreState: (tracks: Track[], clips: Clip[]) => void;
}

const TRACK_COLORS = ['#FF5722', '#2196F3', '#4CAF50', '#9C27B0', '#FF9800', '#00BCD4'];

/**
 * Prépare les historiques pour une nouvelle action :
 * - pousse un snapshot dans l'undoHistory (max 30 entrées)
 * - vide le redoHistory (une nouvelle action invalide le futur)
 */
function pushHistory(s: TracksState): { _undoHistory: Snapshot[]; _redoHistory: Snapshot[] } {
  const snap: Snapshot = { tracks: s.tracks, clips: s.clips };
  const history = [...s._undoHistory, snap];
  return {
    _undoHistory: history.length > MAX_UNDO ? history.slice(history.length - MAX_UNDO) : history,
    _redoHistory: [],
  };
}

let _dupCounter = 0;

export const useTracksStore = create<TracksState>()((set) => ({
  tracks: [],
  clips: [],
  selectedClipId: null,
  selectedTrackId: null,
  _undoHistory: [],
  _redoHistory: [],
  _clipboard: null,

  addTrack: (name, type, color) => {
    const id = crypto.randomUUID();
    const newTrack: Track = {
      id, name, type,
      color: color || TRACK_COLORS[0],
      volume: 1.0, pan: 0.0, muted: false, solo: false,
    };
    set((s) => ({
      ...pushHistory(s),
      tracks: [...s.tracks, newTrack],
    }));
  },

  removeTrack: (id) =>
    set((s) => ({
      ...pushHistory(s),
      tracks: s.tracks.filter((t) => t.id !== id),
      clips: s.clips.filter((c) => c.trackId !== id),
    })),

  updateTrack: (id, updates) =>
    set((s) => ({
      ...pushHistory(s),
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  addClip: (clip) =>
    set((s) => ({
      ...pushHistory(s),
      clips: [...s.clips, clip],
    })),

  removeClip: (id) =>
    set((s) => ({
      ...pushHistory(s),
      clips: s.clips.filter((c) => c.id !== id),
    })),

  updateClip: (id, updates) =>
    set((s) => ({
      ...pushHistory(s),
      clips: s.clips.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  moveClip: (clipId, newTrackId, newPosition) =>
    set((s) => ({
      ...pushHistory(s),
      clips: s.clips.map((c) =>
        c.id === clipId ? { ...c, trackId: newTrackId, position: newPosition } : c
      ),
    })),

  selectClip: (selectedClipId) => set({ selectedClipId }),
  selectTrack: (selectedTrackId) => set({ selectedTrackId }),

  undo: () =>
    set((s) => {
      if (s._undoHistory.length === 0) return {};
      const undoHistory = [...s._undoHistory];
      const snap = undoHistory.pop()!;
      // Sauvegarder l'état courant dans le redoHistory.
      const redoSnap: Snapshot = { tracks: s.tracks, clips: s.clips };
      const redoHistory = [...s._redoHistory, redoSnap];
      return {
        _undoHistory: undoHistory,
        _redoHistory: redoHistory.length > MAX_UNDO ? redoHistory.slice(redoHistory.length - MAX_UNDO) : redoHistory,
        tracks: snap.tracks,
        clips: snap.clips,
      };
    }),

  redo: () =>
    set((s) => {
      if (s._redoHistory.length === 0) return {};
      const redoHistory = [...s._redoHistory];
      const snap = redoHistory.pop()!;
      // Sauvegarder l'état courant dans l'undoHistory.
      const undoSnap: Snapshot = { tracks: s.tracks, clips: s.clips };
      const undoHistory = [...s._undoHistory, undoSnap];
      return {
        _undoHistory: undoHistory.length > MAX_UNDO ? undoHistory.slice(undoHistory.length - MAX_UNDO) : undoHistory,
        _redoHistory: redoHistory,
        tracks: snap.tracks,
        clips: snap.clips,
      };
    }),

  copyClip: (id) =>
    set((s) => {
      const clip = s.clips.find((c) => c.id === id);
      if (!clip) return {};
      return { _clipboard: clip };
    }),

  pasteClip: () =>
    set((s) => {
      if (!s._clipboard) return {};
      const src = s._clipboard;
      const newClip: Clip = {
        ...src,
        id: `clip-paste-${++_dupCounter}-${Date.now()}`,
        position: src.position + 0.5,
      };
      return {
        ...pushHistory(s),
        clips: [...s.clips, newClip],
        selectedClipId: newClip.id,
      };
    }),

  duplicateClip: (id) =>
    set((s) => {
      const clip = s.clips.find((c) => c.id === id);
      if (!clip) return {};
      const newClip: Clip = {
        ...clip,
        id: `clip-dup-${++_dupCounter}-${Date.now()}`,
        position: clip.position + clip.duration,
      };
      return {
        ...pushHistory(s),
        clips: [...s.clips, newClip],
        selectedClipId: newClip.id,
      };
    }),

  restoreState: (tracks, clips) =>
    set({ tracks, clips, selectedClipId: null, selectedTrackId: null, _undoHistory: [], _redoHistory: [] }),
}));
