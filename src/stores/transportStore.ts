import { create } from 'zustand';
import { playAudio, pauseAudio, stopAudio, getPosition } from '../utils/tauri-commands';

interface TransportState {
  // ─── État ─────────────────────────────────────────────────────────────────
  isPlaying: boolean;
  isRecording: boolean;
  /** Position courante en secondes (synchronisée depuis le Rust toutes les 50ms). */
  position: number;
  bpm: number;
  loopEnabled: boolean;
  loopStart: number;  // en secondes
  loopEnd: number;    // en secondes
  metronomeEnabled: boolean;

  // ─── Actions IPC (appellent le backend Rust) ──────────────────────────────
  /** Démarre la lecture. */
  play: () => Promise<void>;
  /** Met en pause (position conservée). */
  pause: () => Promise<void>;
  /** Arrête la lecture et remet la position à 0. */
  stop: () => Promise<void>;
  /** Interroge le backend pour mettre à jour la position (appelée par useTransport). */
  syncPosition: () => Promise<void>;

  // ─── Setters UI ───────────────────────────────────────────────────────────
  setPlaying: (playing: boolean) => void;
  setRecording: (recording: boolean) => void;
  setBpm: (bpm: number) => void;
  setPosition: (position: number) => void;
  setLoop: (enabled: boolean, start?: number, end?: number) => void;
  toggleMetronome: () => void;
}

export const useTransportStore = create<TransportState>()((set) => ({
  isPlaying: false,
  isRecording: false,
  position: 0,
  bpm: 120,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 8,
  metronomeEnabled: false,

  // ─── Actions IPC ──────────────────────────────────────────────────────────

  play: async () => {
    try {
      await playAudio();
      set({ isPlaying: true });
    } catch (e) {
      console.error('[TransportStore] play error', e);
    }
  },

  pause: async () => {
    try {
      await pauseAudio();
      set({ isPlaying: false });
    } catch (e) {
      console.error('[TransportStore] pause error', e);
    }
  },

  stop: async () => {
    try {
      await stopAudio();
      set({ isPlaying: false, position: 0 });
    } catch (e) {
      console.error('[TransportStore] stop error', e);
    }
  },

  syncPosition: async () => {
    try {
      const pos = await getPosition();
      set({ position: pos });
    } catch {
      // Ignorer les erreurs de polling silencieusement
    }
  },

  // ─── Setters UI ───────────────────────────────────────────────────────────

  setPlaying: (isPlaying) => set({ isPlaying }),
  setRecording: (isRecording) => set({ isRecording }),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(240, bpm)) }),
  setPosition: (position) => set({ position }),
  setLoop: (loopEnabled, loopStart, loopEnd) =>
    set((s) => ({
      loopEnabled,
      loopStart: loopStart ?? s.loopStart,
      loopEnd: loopEnd ?? s.loopEnd,
    })),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),
}));
