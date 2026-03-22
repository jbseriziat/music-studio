import { create } from 'zustand';

export interface MeterData {
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
}

interface MixerState {
  masterVolume: number;     // 0.0 – 1.0
  masterVolumDb: number;    // en dB
  meters: Record<string, MeterData>;  // trackId → niveaux
  // Actions
  setMasterVolume: (volume: number) => void;
  updateMeter: (trackId: string, data: MeterData) => void;
  resetMeters: () => void;
}

const LINEAR_TO_DB = (v: number) => (v <= 0 ? -Infinity : 20 * Math.log10(v));
const DB_TO_LINEAR = (db: number) => (db === -Infinity ? 0 : Math.pow(10, db / 20));

export const useMixerStore = create<MixerState>()((set) => ({
  masterVolume: DB_TO_LINEAR(0),
  masterVolumDb: 0,
  meters: {},

  setMasterVolume: (volume) =>
    set({ masterVolume: volume, masterVolumDb: LINEAR_TO_DB(volume) }),

  updateMeter: (trackId, data) =>
    set((s) => ({ meters: { ...s.meters, [trackId]: data } })),

  resetMeters: () => set({ meters: {} }),
}));
