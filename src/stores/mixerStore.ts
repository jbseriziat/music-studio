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

export interface MasteringData {
  lufsMomentary: number;
  lufsShortterm: number;
  lufsIntegrated: number;
  truePeakDb: number;
  limiterGrDb: number;
  spectrum: number[];
}

const ZERO_MASTERING: MasteringData = {
  lufsMomentary: -70, lufsShortterm: -70, lufsIntegrated: -70,
  truePeakDb: -70, limiterGrDb: 0, spectrum: [],
};

interface MixerState {
  masterVolume: number;
  masterVolumeDb: number;
  masterMeter: MeterData;
  meters: Record<string, MeterData>;
  masteringData: MasteringData;
  // Actions
  setMasterVolume: (volume: number) => void;
  updateMeter: (trackId: string, data: MeterData) => void;
  updateMasterMeter: (data: MeterData) => void;
  updateMasteringData: (data: MasteringData) => void;
  resetMeters: () => void;
}

const ZERO_METER: MeterData = { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };

export const useMixerStore = create<MixerState>()((set) => ({
  masterVolume: DB_TO_LINEAR(0),
  masterVolumeDb: 0,
  masterMeter: ZERO_METER,
  meters: {},
  masteringData: ZERO_MASTERING,

  setMasterVolume: (volume) =>
    set({ masterVolume: volume, masterVolumeDb: LINEAR_TO_DB(volume) }),

  updateMeter: (trackId, data) =>
    set((s) => ({ meters: { ...s.meters, [trackId]: data } })),

  updateMasterMeter: (data) => set({ masterMeter: data }),

  updateMasteringData: (data) => set({ masteringData: data }),

  resetMeters: () => set({ meters: {}, masterMeter: ZERO_METER, masteringData: ZERO_MASTERING }),
}));
