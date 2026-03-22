import { create } from 'zustand';

interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  position: number;       // en beats
  loopEnabled: boolean;
  loopStart: number;      // en beats
  loopEnd: number;        // en beats
  metronomeEnabled: boolean;
  // Actions
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
  bpm: 120,
  position: 0,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 4,
  metronomeEnabled: false,

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
