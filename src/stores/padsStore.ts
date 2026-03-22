import { create } from 'zustand';
import {
  triggerPad as triggerPadCmd,
  assignPadSample as assignPadSampleCmd,
} from '../utils/tauri-commands';

// ─── Palette exacte de 16 couleurs (dans l'ordre) ─────────────────────────────
export const PAD_COLORS = [
  '#F44336', '#FF9800', '#FFEB3B', '#4CAF50',
  '#2196F3', '#9C27B0', '#795548', '#FFFFFF',
  '#E91E63', '#FF5722', '#CDDC39', '#009688',
  '#3F51B5', '#673AB7', '#607D8B', '#FFC107',
];

// Couleur de texte : sombre pour les fonds clairs (jaunes, blancs, lime, amber)
const PAD_TEXT_COLORS = [
  '#fff', '#fff', '#333', '#fff',
  '#fff', '#fff', '#fff', '#333',
  '#fff', '#fff', '#333', '#fff',
  '#fff', '#fff', '#fff', '#333',
];

// Emojis par défaut associés aux sons pré-chargés
const DEFAULT_ICONS = [
  '🥁', '🥁', '🥁', '🥁',
  '🎵', '🎵', '👏', '🥁',
  '🥁', '🎹', '🎹', '🎹',
  '🎸', '🎸', '🐱', '💨',
];

// Noms courts par défaut (écrasés par les vrais noms à l'initialisation)
const DEFAULT_NAMES = [
  'Kick', 'Kick 2', 'Snare', 'Snare 2',
  'Hi-hat', 'Hi-hat O', 'Clap', 'Tom H',
  'Tom B', 'Do', 'Ré', 'Mi',
  'Fa', 'Sol', 'Chat', 'Swoosh',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PadConfig {
  id: number;
  sampleId: number | null;
  sampleName: string;
  color: string;
  textColor: string;
  icon: string;
}

interface PadsState {
  pads: PadConfig[];
  /** Met à jour le sample associé à un pad (store + IPC backend). */
  assignPadSample: (padId: number, sampleId: number, sampleName: string) => void;
  /** Déclenche la lecture du pad (IPC backend). */
  triggerPad: (padId: number) => Promise<void>;
  /** Met à jour le nom / sampleId d'un pad sans notifier le backend (utilisé au chargement). */
  setPadName: (padId: number, sampleId: number | null, sampleName: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePadsStore = create<PadsState>()((set, get) => ({
  pads: Array.from({ length: 16 }, (_, i) => ({
    id: i,
    sampleId: null,
    sampleName: DEFAULT_NAMES[i],
    color: PAD_COLORS[i],
    textColor: PAD_TEXT_COLORS[i],
    icon: DEFAULT_ICONS[i],
  })),

  assignPadSample: (padId, sampleId, sampleName) => {
    set((s) => ({
      pads: s.pads.map((p) =>
        p.id === padId ? { ...p, sampleId, sampleName } : p
      ),
    }));
    assignPadSampleCmd(padId, sampleId).catch((e) =>
      console.error('[PadsStore] assignPadSample error', e)
    );
  },

  triggerPad: async (padId) => {
    const { pads } = get();
    const pad = pads[padId];
    // Ne rien faire si aucun sample assigné
    if (!pad || pad.sampleId === null) return;
    try {
      await triggerPadCmd(padId);
    } catch (e) {
      console.error('[PadsStore] triggerPad error', e);
    }
  },

  setPadName: (padId, sampleId, sampleName) =>
    set((s) => ({
      pads: s.pads.map((p) =>
        p.id === padId ? { ...p, sampleId, sampleName } : p
      ),
    })),
}));
