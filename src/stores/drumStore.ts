import { create } from 'zustand';
import {
  setDrumStep,
  assignDrumPad,
  triggerDrumPadCmd,
  setDrumStepCount,
  setDrumPattern,
  setDrumPadVolume,
  setDrumPadPitch,
  loadDrumKitCmd,
  type DrumPatternDto,
} from '../utils/tauri-commands';
import { PAD_COLORS } from './padsStore';

// ─── Constantes ───────────────────────────────────────────────────────────────

export const DRUM_PAD_COUNT = 8;
export const MAX_STEPS = 32;

/** Labels et icônes des 8 pads du drum rack (dans l'ordre). */
export const DRUM_PAD_DEFAULTS = [
  { name: 'Kick',     icon: '🥁', sampleId: 0  },
  { name: 'Snare',    icon: '🥁', sampleId: 2  },
  { name: 'Hi-hat',   icon: '🎵', sampleId: 4  },
  { name: 'HH Open',  icon: '🎵', sampleId: 5  },
  { name: 'Clap',     icon: '👏', sampleId: 6  },
  { name: 'Tom H',    icon: '🥁', sampleId: 7  },
  { name: 'Tom B',    icon: '🥁', sampleId: 8  },
  { name: 'Snare 2',  icon: '🥁', sampleId: 3  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrumPadConfig {
  sampleId: number;
  sampleName: string;
  icon: string;
  color: string;
}

interface DrumState {
  // ─── Pattern ──────────────────────────────────────────────────────────────
  /** Grille : steps[pad][step] = active */
  steps: boolean[][];
  /** Vélocités : velocities[pad][step] = 0.0–1.0 */
  velocities: number[][];
  /** Nombre de steps actifs (8, 16, 32). */
  stepCount: number;

  // ─── Config des pads ──────────────────────────────────────────────────────
  pads: DrumPadConfig[];

  // ─── Volume et pitch par pad ──────────────────────────────────────────────
  padVolumes: number[]; // [0.0–2.0] × 8
  padPitches: number[]; // [−12–+12] × 8

  // ─── Curseur de lecture (mis à jour par polling) ───────────────────────────
  currentStep: number;

  // ─── Actions ──────────────────────────────────────────────────────────────
  toggleStep: (pad: number, step: number) => void;
  setStepCount: (count: number) => void;
  assignPad: (pad: number, sampleId: number, sampleName: string) => void;
  triggerPad: (pad: number) => void;
  setCurrentStep: (step: number) => void;
  /** Ajuste le volume d'un pad (0.0–2.0). */
  setPadVolume: (pad: number, volume: number) => void;
  /** Transpose un pad en demi-tons (−12 à +12). */
  setPadPitch: (pad: number, pitch: number) => void;
  /** Charge un kit prédéfini depuis le moteur audio. */
  loadKit: (kitName: string) => Promise<void>;
  /** Applique un pattern complet (chargement projet/preset). */
  applyPattern: (pattern: DrumPatternDto) => void;
  /** Réinitialise le pattern (tous les steps à false). */
  clearPattern: () => void;
}

// ─── Initialiseurs ────────────────────────────────────────────────────────────

function makeEmptySteps(): boolean[][] {
  return Array.from({ length: DRUM_PAD_COUNT }, () => Array(MAX_STEPS).fill(false));
}

function makeDefaultVelocities(): number[][] {
  return Array.from({ length: DRUM_PAD_COUNT }, () => Array(MAX_STEPS).fill(1.0));
}

function makeDefaultPads(): DrumPadConfig[] {
  return DRUM_PAD_DEFAULTS.map((d, i) => ({
    sampleId: d.sampleId,
    sampleName: d.name,
    icon: d.icon,
    color: PAD_COLORS[i % PAD_COLORS.length],
  }));
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDrumStore = create<DrumState>()((set, get) => ({
  steps: makeEmptySteps(),
  velocities: makeDefaultVelocities(),
  stepCount: 16,
  pads: makeDefaultPads(),
  padVolumes: Array(DRUM_PAD_COUNT).fill(1.0),
  padPitches: Array(DRUM_PAD_COUNT).fill(0.0),
  currentStep: 0,

  toggleStep: (pad, step) => {
    const { steps, velocities } = get();
    const newSteps = steps.map((row, p) =>
      p === pad ? row.map((v, s) => (s === step ? !v : v)) : row
    );
    const active = newSteps[pad][step];
    const velocity = velocities[pad][step];
    set({ steps: newSteps });
    setDrumStep(pad, step, active, velocity).catch((e) =>
      console.error('[DrumStore] setDrumStep error', e)
    );
  },

  setStepCount: (count) => {
    const valid = [8, 16, 32].includes(count) ? count : 16;
    set({ stepCount: valid });
    setDrumStepCount(valid).catch((e) =>
      console.error('[DrumStore] setDrumStepCount error', e)
    );
  },

  assignPad: (pad, sampleId, sampleName) => {
    const { pads } = get();
    const newPads = pads.map((p, i) =>
      i === pad ? { ...p, sampleId, sampleName } : p
    );
    set({ pads: newPads });
    assignDrumPad(pad, sampleId).catch((e) =>
      console.error('[DrumStore] assignDrumPad error', e)
    );
  },

  triggerPad: (pad) => {
    triggerDrumPadCmd(pad).catch((e) =>
      console.error('[DrumStore] triggerDrumPad error', e)
    );
  },

  setCurrentStep: (step) => set({ currentStep: step }),

  setPadVolume: (pad, volume) => {
    const v = Math.max(0.0, Math.min(2.0, volume));
    set((s) => {
      const next = [...s.padVolumes];
      next[pad] = v;
      return { padVolumes: next };
    });
    setDrumPadVolume(pad, v).catch((e) =>
      console.error('[DrumStore] setPadVolume error', e)
    );
  },

  setPadPitch: (pad, pitch) => {
    const p = Math.max(-12, Math.min(12, Math.round(pitch)));
    set((s) => {
      const next = [...s.padPitches];
      next[pad] = p;
      return { padPitches: next };
    });
    setDrumPadPitch(pad, p).catch((e) =>
      console.error('[DrumStore] setPadPitch error', e)
    );
  },

  loadKit: async (kitName) => {
    try {
      const padConfigs = await loadDrumKitCmd(kitName);
      const newPads = get().pads.map((p, i) => {
        const cfg = padConfigs[i];
        if (!cfg) return p;
        return { ...p, sampleId: cfg.sample_id, sampleName: cfg.name };
      });
      const newVolumes = padConfigs.map((c) => c.volume);
      const newPitches = padConfigs.map((c) => c.pitch_semitones);
      set({ pads: newPads, padVolumes: newVolumes, padPitches: newPitches });
    } catch (e) {
      console.error('[DrumStore] loadKit error', e);
    }
  },

  applyPattern: (pattern) => {
    const newSteps = makeEmptySteps();
    const newVelocities = makeDefaultVelocities();
    const count = Math.min(pattern.steps, MAX_STEPS);
    for (let p = 0; p < DRUM_PAD_COUNT && p < pattern.pads.length; p++) {
      for (let s = 0; s < count && s < pattern.pads[p].length; s++) {
        newSteps[p][s] = pattern.pads[p][s];
        if (pattern.velocities[p]?.[s] !== undefined) {
          newVelocities[p][s] = pattern.velocities[p][s];
        }
      }
    }
    set({ steps: newSteps, velocities: newVelocities, stepCount: count });
    setDrumPattern(pattern).catch((e) =>
      console.error('[DrumStore] setDrumPattern error', e)
    );
  },

  clearPattern: () => {
    const empty: DrumPatternDto = {
      steps: get().stepCount,
      pads: Array.from({ length: DRUM_PAD_COUNT }, () => Array(MAX_STEPS).fill(false)),
      velocities: Array.from({ length: DRUM_PAD_COUNT }, () => Array(MAX_STEPS).fill(1.0)),
    };
    set({ steps: makeEmptySteps() });
    setDrumPattern(empty).catch((e) =>
      console.error('[DrumStore] clearPattern error', e)
    );
  },
}));
