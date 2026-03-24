import { create } from 'zustand';

export type EffectType = 'reverb' | 'delay';

export interface EffectSlotState {
  id: number;
  type: EffectType;
  bypass: boolean;
  params: Record<string, number>;
}

interface EffectsStore {
  /** Effets par piste : clé = trackId (string) */
  trackEffects: Record<string, EffectSlotState[]>;
  /** Ajoute un slot d'effet sur une piste. */
  addEffect: (trackId: string, slot: EffectSlotState) => void;
  /** Supprime un slot d'effet d'une piste. */
  removeEffect: (trackId: string, effectId: number) => void;
  /** Met à jour un paramètre d'un effet. */
  setEffectParam: (trackId: string, effectId: number, param: string, value: number) => void;
  /** Active/désactive le bypass d'un effet. */
  setEffectBypass: (trackId: string, effectId: number, bypass: boolean) => void;
}

export const useEffectsStore = create<EffectsStore>((set) => ({
  trackEffects: {},

  addEffect: (trackId, slot) =>
    set((state) => ({
      trackEffects: {
        ...state.trackEffects,
        [trackId]: [...(state.trackEffects[trackId] ?? []), slot],
      },
    })),

  removeEffect: (trackId, effectId) =>
    set((state) => ({
      trackEffects: {
        ...state.trackEffects,
        [trackId]: (state.trackEffects[trackId] ?? []).filter((s) => s.id !== effectId),
      },
    })),

  setEffectParam: (trackId, effectId, param, value) =>
    set((state) => ({
      trackEffects: {
        ...state.trackEffects,
        [trackId]: (state.trackEffects[trackId] ?? []).map((s) =>
          s.id === effectId ? { ...s, params: { ...s.params, [param]: value } } : s,
        ),
      },
    })),

  setEffectBypass: (trackId, effectId, bypass) =>
    set((state) => ({
      trackEffects: {
        ...state.trackEffects,
        [trackId]: (state.trackEffects[trackId] ?? []).map((s) =>
          s.id === effectId ? { ...s, bypass } : s,
        ),
      },
    })),
}));
