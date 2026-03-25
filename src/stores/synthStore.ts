import { create } from 'zustand';
import {
  createSynthTrack,
  listSynthPresets,
  loadSynthPresetCmd,
  setSynthParam,
  noteOnCmd,
  noteOffCmd,
  setMidiActiveTrack,
  type PresetInfo,
} from '../utils/tauri-commands';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'pulsewidth';

export type LfoWaveform = 'sine' | 'square' | 'triangle' | 'saw' | 'sampleandhold';

export type ModDestination = 'pitch' | 'cutoff' | 'volume' | 'pan' | 'osc2pitch' | 'resonance';

export type SynthModeType = 'poly' | 'mono' | 'legato';

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
  // ── Phase 5 ──────────────────────────────
  osc2_enabled: boolean;
  osc2_waveform: Waveform;
  osc2_octave: number;
  osc2_detune: number;
  osc_mix: number;   // 0.0–1.0
  lfo1_waveform: LfoWaveform;
  lfo1_rate: number;
  lfo1_depth: number;
  lfo1_destination: ModDestination;
  lfo1_sync: boolean;
  lfo2_waveform: LfoWaveform;
  lfo2_rate: number;
  lfo2_depth: number;
  lfo2_destination: ModDestination;
  lfo2_sync: boolean;
  synth_mode: SynthModeType;
  glide_time: number;  // ms
  // ── Phase 5.2 ────────────────────────────
  filter_type: number;        // 0=LP12, 1=LP24, 2=HP, 3=BP, 4=Notch
  drive: number;              // 0.0–1.0
  filter_env_amount: number;  // 0.0–1.0
  filter_env_attack: number;
  filter_env_decay: number;
  filter_env_sustain: number;
  filter_env_release: number;
}

export type FilterTypeName = 'LP12' | 'LP24' | 'HP' | 'BP' | 'Notch';
export type ModSourceName = 'Envelope1' | 'Envelope2' | 'LFO1' | 'LFO2' | 'Velocity' | 'NoteNumber';

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
  setParam: (param: keyof SynthParams, value: number | Waveform | LfoWaveform | ModDestination | SynthModeType | boolean) => void;
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
  osc2_enabled: false,
  osc2_waveform: 'sine',
  osc2_octave: 0,
  osc2_detune: 0,
  osc_mix: 0.5,
  lfo1_waveform: 'sine',
  lfo1_rate: 1.0,
  lfo1_depth: 0.0,
  lfo1_destination: 'pitch',
  lfo1_sync: false,
  lfo2_waveform: 'sine',
  lfo2_rate: 1.0,
  lfo2_depth: 0.0,
  lfo2_destination: 'cutoff',
  lfo2_sync: false,
  synth_mode: 'poly',
  glide_time: 0,
  filter_type: 0,
  drive: 0,
  filter_env_amount: 0,
  filter_env_attack: 0.005,
  filter_env_decay: 0.200,
  filter_env_sustain: 0.0,
  filter_env_release: 0.300,
};

// Correspondance waveform → valeur numérique pour le backend Rust
const WAVEFORM_INDEX: Record<Waveform, number> = {
  sine: 0,
  square: 1,
  sawtooth: 2,
  triangle: 3,
  noise: 4,
  pulsewidth: 5,
};

const LFO_WAVEFORM_INDEX: Record<LfoWaveform, number> = {
  sine: 0,
  square: 1,
  triangle: 2,
  saw: 3,
  sampleandhold: 4,
};

const MOD_DEST_INDEX: Record<ModDestination, number> = {
  pitch: 0,
  cutoff: 1,
  volume: 2,
  pan: 3,
  osc2pitch: 4,
  resonance: 5,
};

const SYNTH_MODE_INDEX: Record<SynthModeType, number> = {
  poly: 0,
  mono: 1,
  legato: 2,
};

// Params that use boolean → number conversion
const BOOL_PARAMS = new Set<string>(['osc2_enabled', 'lfo1_sync', 'lfo2_sync']);

// Params that use special index maps
const WAVEFORM_PARAMS = new Set<string>(['waveform', 'osc2_waveform']);
const LFO_WAVEFORM_PARAMS = new Set<string>(['lfo1_waveform', 'lfo2_waveform']);
const MOD_DEST_PARAMS = new Set<string>(['lfo1_destination', 'lfo2_destination']);
const MODE_PARAMS = new Set<string>(['synth_mode']);

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
      setMidiActiveTrack(trackId).catch(console.error);
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
      activePresetName: null,
    }));

    // Envoi au backend
    let numValue: number;
    if (BOOL_PARAMS.has(param)) {
      numValue = value ? 1.0 : 0.0;
    } else if (WAVEFORM_PARAMS.has(param)) {
      numValue = WAVEFORM_INDEX[value as Waveform] ?? 0;
    } else if (LFO_WAVEFORM_PARAMS.has(param)) {
      numValue = LFO_WAVEFORM_INDEX[value as LfoWaveform] ?? 0;
    } else if (MOD_DEST_PARAMS.has(param)) {
      numValue = MOD_DEST_INDEX[value as ModDestination] ?? 0;
    } else if (MODE_PARAMS.has(param)) {
      numValue = SYNTH_MODE_INDEX[value as SynthModeType] ?? 0;
    } else {
      numValue = value as number;
    }
    setSynthParam(trackId, param, numValue).catch(console.error);
  },

  loadPreset: async (presetName) => {
    const { trackId, presets } = get();
    if (trackId === null) return;

    await loadSynthPresetCmd(trackId, presetName);

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
