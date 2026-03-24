import { create } from 'zustand';
import {
  addMidiClip,
  updateMidiClipNotes,
  noteOnCmd,
  noteOffCmd,
} from '../utils/tauri-commands';
import type { MidiNoteData } from '../utils/tauri-commands';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Valeurs de quantification : 1/4, 1/8, 1/16 de beat. */
export type Quantize = 0.25 | 0.125 | 0.0625;

/** Une note MIDI dans le piano roll. */
export interface PianoRollNote {
  id: number;
  note: number;           // 0–127 (60 = C4)
  startBeats: number;     // position relative au début du clip, en beats
  durationBeats: number;  // durée en beats
  velocity: number;       // 0–127
}

// ─── State ─────────────────────────────────────────────────────────────────────

interface PianoRollState {
  /** Le piano roll est-il ouvert ? */
  isOpen: boolean;
  /** ID de la piste synthé (backend) associée. null = pas de piste. */
  trackId: number | null;
  /** ID du clip MIDI actif (backend). null = clip non encore créé. */
  clipId: number | null;
  /** Notes du clip actif. */
  notes: PianoRollNote[];
  /** IDs des notes sélectionnées. */
  selectedNoteIds: Set<number>;
  /** Quantification active. */
  quantize: Quantize;
  /** Compteur local pour générer les IDs de notes. */
  _nextNoteId: number;

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Ouvre le piano roll pour une piste synthé. Crée le clip Rust si nécessaire. */
  openForTrack: (trackId: number) => Promise<void>;

  /** Ferme le piano roll (conserve les données). */
  close: () => void;

  /** Ajoute une note et synchronise avec le backend. */
  addNote: (note: number, startBeats: number, durationBeats: number, velocity: number) => void;

  /** Met à jour une note existante et synchronise. */
  updateNote: (id: number, patch: Partial<Omit<PianoRollNote, 'id'>>) => void;

  /** Supprime une ou plusieurs notes et synchronise. */
  deleteNotes: (ids: number[]) => void;

  /** Sélectionne/désélectionne des notes. */
  setSelection: (ids: number[]) => void;

  /** Efface toutes les notes sélectionnées. */
  deleteSelectedNotes: () => void;

  /** Change la quantification. */
  setQuantize: (q: Quantize) => void;

  /** Joue une note en aperçu (note_on sans transport). */
  previewNoteOn: (note: number) => void;
  previewNoteOff: (note: number) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Convertit les notes du store vers le format backend (snake_case). */
function toMidiNoteData(notes: PianoRollNote[]): MidiNoteData[] {
  return notes.map(n => ({
    id: n.id,
    note: n.note,
    start_beats: n.startBeats,
    duration_beats: n.durationBeats,
    velocity: n.velocity,
  }));
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const usePianoRollStore = create<PianoRollState>((set, get) => ({
  isOpen: false,
  trackId: null,
  clipId: null,
  notes: [],
  selectedNoteIds: new Set(),
  quantize: 0.125, // 1/8 par défaut
  _nextNoteId: 1,

  openForTrack: async (trackId) => {
    const { clipId } = get();
    // Si aucun clip n'existe encore, en créer un depuis le beat 0 sur 4 beats.
    let activeClipId = clipId;
    if (activeClipId === null) {
      try {
        activeClipId = await addMidiClip(trackId, 0, 4);
      } catch (err) {
        console.error('[pianoRollStore] addMidiClip failed:', err);
        return;
      }
    }
    set({ isOpen: true, trackId, clipId: activeClipId });
  },

  close: () => {
    set({ isOpen: false });
  },

  addNote: (note, startBeats, durationBeats, velocity) => {
    const { trackId, clipId, _nextNoteId } = get();
    if (trackId === null || clipId === null) return;
    const newNote: PianoRollNote = {
      id: _nextNoteId,
      note,
      startBeats,
      durationBeats,
      velocity,
    };
    const notes = [...get().notes, newNote];
    set({ notes, _nextNoteId: _nextNoteId + 1 });
    updateMidiClipNotes(trackId, clipId, toMidiNoteData(notes)).catch(console.error);
  },

  updateNote: (id, patch) => {
    const { trackId, clipId } = get();
    if (trackId === null || clipId === null) return;
    const notes = get().notes.map(n => n.id === id ? { ...n, ...patch } : n);
    set({ notes });
    updateMidiClipNotes(trackId, clipId, toMidiNoteData(notes)).catch(console.error);
  },

  deleteNotes: (ids) => {
    const { trackId, clipId } = get();
    if (trackId === null || clipId === null) return;
    const idSet = new Set(ids);
    const notes = get().notes.filter(n => !idSet.has(n.id));
    const selectedNoteIds = new Set([...get().selectedNoteIds].filter(id => !idSet.has(id)));
    set({ notes, selectedNoteIds });
    updateMidiClipNotes(trackId, clipId, toMidiNoteData(notes)).catch(console.error);
  },

  setSelection: (ids) => {
    set({ selectedNoteIds: new Set(ids) });
  },

  deleteSelectedNotes: () => {
    const { selectedNoteIds, deleteNotes } = get();
    if (selectedNoteIds.size === 0) return;
    deleteNotes([...selectedNoteIds]);
  },

  setQuantize: (q) => {
    set({ quantize: q });
  },

  previewNoteOn: (note) => {
    const { trackId } = get();
    if (trackId === null) return;
    noteOnCmd(trackId, note, 100).catch(console.error);
  },

  previewNoteOff: (note) => {
    const { trackId } = get();
    if (trackId === null) return;
    noteOffCmd(trackId, note).catch(console.error);
  },
}));
