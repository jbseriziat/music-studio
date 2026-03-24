import { create } from 'zustand';

export interface MeterData {
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
}

export const LINEAR_TO_DB = (v: number): number =>
  v <= 0 ? -Infinity : 20 * Math.log10(v);
export const DB_TO_LINEAR = (db: number): number =>
  db === -Infinity ? 0 : Math.pow(10, db / 20);

interface MixerState {
  masterVolume: number;      // 0.0 – 1.0
  masterVolumeDb: number;    // en dB
  masterMeter: MeterData;
  meters: Record<string, MeterData>;  // trackId → niveaux
  // Actions
  setMasterVolume: (volume: number) => void;
  updateMeter: (trackId: string, data: MeterData) => void;
  updateMasterMeter: (data: MeterData) => void;
  resetMeters: () => void;
}

const ZERO_METER: MeterData = { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };

export const useMixerStore = create<MixerState>()((set) => ({
  masterVolume: DB_TO_LINEAR(0),
  masterVolumeDb: 0,
  masterMeter: ZERO_METER,
  meters: {},

  setMasterVolume: (volume) =>
    set({ masterVolume: volume, masterVolumeDb: LINEAR_TO_DB(volume) }),

  updateMeter: (trackId, data) =>
    set((s) => ({ meters: { ...s.meters, [trackId]: data } })),

  updateMasterMeter: (data) => set({ masterMeter: data }),

  resetMeters: () => set({ meters: {}, masterMeter: ZERO_METER }),
}));
