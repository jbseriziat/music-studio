import { create } from 'zustand';
import {
  createSynthTrack,
  listSynthPresets,
  loadSynthPresetCmd,
  setSynthParam,
  noteOnCmd,
  noteOffCmd,
  type PresetInfo,
} from '../utils/tauri-commands';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface SynthParams {
  waveform: Waveform;
  octave: number;   // -2 à +2
  detune: number;   // -50 à +50
  attack: number;   // secondes
  decay: number;    // secondes
  sustain: number;  // 0.0–1.0
  release: number;  // secondes
  cutoff: number;   // Hz
  resonance: number; // 0.0–1.0
  volume: number;   // 0.0–2.0
}

interface SynthStore {
  /** Track ID Rust (≥ 100). null = pas encore initialisé. */
  trackId: number | null;
  /** Paramètres du preset courant (pour l'affichage UI). */
  params: SynthParams;
  /** Liste des presets intégrés. */
  presets: PresetInfo[];
  /** Nom du preset actif (ou null si personnalisé). */
  activePresetName: string | null;
  /** true pendant l'initialisation. */
  isInitializing: boolean;

  // Actions
  init: () => Promise<void>;
  setParam: (param: keyof SynthParams, value: number | Waveform) => void;
  loadPreset: (presetName: string) => Promise<void>;
  noteOn: (note: number, velocity?: number) => void;
  noteOff: (note: number) => void;
}

// ─── Valeurs par défaut ───────────────────────────────────────────────────────

const DEFAULT_PARAMS: SynthParams = {
  waveform: 'sine',
  octave: 0,
  detune: 0,
  attack: 0.010,
  decay: 0.100,
  sustain: 0.7,
  release: 0.200,
  cutoff: 8000,
  resonance: 0.0,
  volume: 0.5,
};

// Correspondance waveform → valeur numérique pour le backend Rust
const WAVEFORM_INDEX: Record<Waveform, number> = {
  sine: 0,
  square: 1,
  sawtooth: 2,
  triangle: 3,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSynthStore = create<SynthStore>((set, get) => ({
  trackId: null,
  params: { ...DEFAULT_PARAMS },
  presets: [],
  activePresetName: null,
  isInitializing: false,

  init: async () => {
    if (get().trackId !== null || get().isInitializing) return;
    set({ isInitializing: true });
    try {
      const [trackId, presets] = await Promise.all([
        createSynthTrack('Synth 1'),
        listSynthPresets(),
      ]);
      set({ trackId, presets, isInitializing: false });
    } catch (err) {
      console.error('[synthStore] init failed:', err);
      set({ isInitializing: false });
    }
  },

  setParam: (param, value) => {
    const { trackId } = get();
    if (trackId === null) return;

    // Mise à jour locale immédiate (UI réactive)
    set(state => ({
      params: { ...state.params, [param]: value },
      activePresetName: null, // Personnalisé
    }));

    // Envoi au backend
    let numValue: number;
    if (param === 'waveform') {
      numValue = WAVEFORM_INDEX[value as Waveform] ?? 0;
      setSynthParam(trackId, 'waveform', numValue).catch(console.error);
    } else {
      numValue = value as number;
      setSynthParam(trackId, param, numValue).catch(console.error);
    }
  },

  loadPreset: async (presetName) => {
    const { trackId, presets } = get();
    if (trackId === null) return;

    await loadSynthPresetCmd(trackId, presetName);

    // Mettre à jour les params locaux depuis la liste des presets
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      set(state => ({
        activePresetName: presetName,
        params: {
          ...state.params,
          waveform: (preset.waveform as Waveform) ?? 'sine',
          attack: preset.attack,
          decay: preset.decay,
          sustain: preset.sustain,
          release: preset.release,
          cutoff: preset.cutoff,
          resonance: preset.resonance,
        },
      }));
    } else {
      set({ activePresetName: presetName });
    }
  },

  noteOn: (note, velocity = 100) => {
    const { trackId } = get();
    if (trackId === null) return;
    noteOnCmd(trackId, note, velocity).catch(console.error);
  },

  noteOff: (note) => {
    const { trackId } = get();
    if (trackId === null) return;
    noteOffCmd(trackId, note).catch(console.error);
  },
}));
