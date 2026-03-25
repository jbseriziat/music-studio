import { create } from 'zustand';
import {
  playAudio, pauseAudio, stopAudio, getPosition,
  setBpmCmd, setMetronomeCmd, setLoopCmd, setMetronomeVolumeCmd,
  startRecordingCmd, stopRecordingCmd,
  armTrackCmd,
  startSynthRecordingCmd, stopSynthRecordingCmd,
} from '../utils/tauri-commands';

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
  /** Volume du métronome : 0.0–1.0. */
  metronomeVolume: number;

  // ─── Actions IPC (appellent le backend Rust) ──────────────────────────────
  /** Démarre la lecture. */
  play: () => Promise<void>;
  /** Met en pause (position conservée). */
  pause: () => Promise<void>;
  /** Arrête la lecture et remet la position à 0. */
  stop: () => Promise<void>;
  /** Interroge le backend pour mettre à jour la position (appelée par useTransport). */
  syncPosition: () => Promise<void>;

  // ─── Actions enregistrement ────────────────────────────────────────────────
  /** Démarre l'enregistrement micro (appelle le backend Rust). */
  startRecording: () => Promise<void>;
  /** Arrête l'enregistrement et retourne le chemin WAV créé. */
  stopRecording: (projectName: string) => Promise<string>;

  // ─── Enregistrement synthé ────────────────────────────────────────────────
  /** ID de la piste actuellement armée pour l'enregistrement (null = aucune). */
  armedTrackId: string | null;
  /** True si un enregistrement de sortie synthé est en cours. */
  isSynthRecording: boolean;
  /** Arme ou désarme une piste. Synchronise aussi le côté Rust (pour l'enregistrement micro). */
  armTrack: (trackId: string | null) => void;
  /** Démarre la capture de la sortie du synthé de la piste armée. */
  startSynthRecording: (trackId: string) => Promise<void>;
  /** Arrête la capture synthé et retourne le chemin WAV créé. */
  stopSynthRecording: (projectName: string) => Promise<string>;

  // ─── Setters UI ───────────────────────────────────────────────────────────
  setPlaying: (playing: boolean) => void;
  setRecording: (recording: boolean) => void;
  setBpm: (bpm: number) => void;
  setPosition: (position: number) => void;
  setLoop: (enabled: boolean, start?: number, end?: number) => void;
  toggleMetronome: () => void;
  setMetronomeVolume: (volume: number) => void;
}

export const useTransportStore = create<TransportState>()((set) => ({
  isPlaying: false,
  isRecording: false,
  armedTrackId: null,
  isSynthRecording: false,
  position: 0,
  bpm: 120,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 8,
  metronomeEnabled: false,
  metronomeVolume: 0.6,

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

  // ─── Actions enregistrement ───────────────────────────────────────────────

  startRecording: async () => {
    try {
      await startRecordingCmd();
      set({ isRecording: true });
    } catch (e) {
      console.error('[TransportStore] startRecording error', e);
    }
  },

  stopRecording: async (projectName: string) => {
    try {
      const wavPath = await stopRecordingCmd(projectName);
      set({ isRecording: false });
      return wavPath;
    } catch (e) {
      console.error('[TransportStore] stopRecording error', e);
      set({ isRecording: false });
      return '';
    }
  },

  // ─── Enregistrement synthé ────────────────────────────────────────────────

  armTrack: (trackId) => {
    set({ armedTrackId: trackId });
    // Synchroniser aussi le Rust (pour compatibilité avec l'enregistrement micro).
    const numId = trackId ? Number(trackId.match(/\d+/)?.[0] ?? 0) : 0;
    armTrackCmd(numId, trackId !== null).catch(
      (e) => console.error('[TransportStore] armTrack error', e),
    );
  },

  startSynthRecording: async (trackId: string) => {
    try {
      const numId = Number(trackId.match(/\d+/)?.[0] ?? 0);
      await startSynthRecordingCmd(numId);
      set({ isSynthRecording: true });
    } catch (e) {
      console.error('[TransportStore] startSynthRecording error', e);
    }
  },

  stopSynthRecording: async (projectName: string) => {
    try {
      const wavPath = await stopSynthRecordingCmd(projectName);
      set({ isSynthRecording: false });
      return wavPath;
    } catch (e) {
      console.error('[TransportStore] stopSynthRecording error', e);
      set({ isSynthRecording: false });
      return '';
    }
  },

  // ─── Setters UI ───────────────────────────────────────────────────────────

  setPlaying: (isPlaying) => set({ isPlaying }),
  setRecording: (isRecording) => set({ isRecording }),
  setBpm: (bpm) => {
    const clamped = Math.max(40, Math.min(240, bpm));
    set({ bpm: clamped });
    setBpmCmd(clamped).catch((e) => console.error('[TransportStore] setBpm error', e));
  },
  setPosition: (position) => set({ position }),
  setLoop: (loopEnabled, loopStart, loopEnd) =>
    set((s) => {
      const start = loopStart ?? s.loopStart;
      const end   = loopEnd   ?? s.loopEnd;
      setLoopCmd(loopEnabled, start, end).catch(
        (e) => console.error('[TransportStore] setLoop error', e),
      );
      return { loopEnabled, loopStart: start, loopEnd: end };
    }),
  toggleMetronome: () =>
    set((s) => {
      const enabled = !s.metronomeEnabled;
      setMetronomeCmd(enabled).catch((e) => console.error('[TransportStore] setMetronome error', e));
      return { metronomeEnabled: enabled };
    }),
  setMetronomeVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set({ metronomeVolume: clamped });
    setMetronomeVolumeCmd(clamped).catch(
      (e) => console.error('[TransportStore] setMetronomeVolume error', e),
    );
  },
}));
