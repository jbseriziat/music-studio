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
  /** Notes stockées par clipId Rust (pour gérer plusieurs clips). */
  perClipNotes: Record<number, PianoRollNote[]>;
  /** Notes copiées dans le presse-papier (Ctrl+C). */
  copiedNotes: PianoRollNote[];

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Ouvre le piano roll pour une piste synthé. Crée le clip Rust si nécessaire. */
  openForTrack: (trackId: number) => Promise<void>;

  /**
   * Ouvre le piano roll pour un clip MIDI existant (identifié par son ID Rust).
   * Sauvegarde les notes du clip actuel avant de changer de clip.
   */
  openForClip: (trackId: number, clipId: number) => void;

  /** Ferme le piano roll (conserve les données dans perClipNotes). */
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

  /** Sélectionne toutes les notes (Ctrl+A). */
  selectAll: () => void;

  /** Copie les notes sélectionnées dans le presse-papier (Ctrl+C). */
  copySelectedNotes: () => void;

  /** Colle les notes copiées, légèrement décalées (Ctrl+V). */
  pasteNotes: () => void;

  /**
   * Restaure les notes par clipId depuis un projet chargé.
   * Utilisé par projectStore lors de l'ouverture d'un projet.
   */
  restoreClipNotes: (allNotes: Record<number, PianoRollNote[]>, nextId: number) => void;
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

/** Synchronise les notes avec le backend pour un clip donné. */
function syncNotes(trackId: number | null, clipId: number | null, notes: PianoRollNote[]) {
  if (trackId === null || clipId === null) return;
  updateMidiClipNotes(trackId, clipId, toMidiNoteData(notes)).catch(console.error);
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
  perClipNotes: {},
  copiedNotes: [],

  openForTrack: async (trackId) => {
    const { clipId } = get();

    // Si un clip existe déjà (créé lors d'une session précédente), rouvrir.
    if (clipId !== null) {
      const existingNotes = get().perClipNotes[clipId] ?? get().notes;
      set({ isOpen: true, trackId, notes: existingNotes });
      return;
    }

    // Sinon créer un nouveau clip Rust.
    try {
      const newClipId = await addMidiClip(trackId, 0, 4);
      set((s) => ({
        isOpen: true,
        trackId,
        clipId: newClipId,
        notes: [],
        perClipNotes: { ...s.perClipNotes, [newClipId]: [] },
      }));
    } catch (err) {
      console.error('[pianoRollStore] addMidiClip failed:', err);
    }
  },

  openForClip: (trackId, clipId) => {
    const { clipId: currentClipId, notes: currentNotes, perClipNotes } = get();

    // Sauvegarder les notes actuelles dans perClipNotes avant de changer de clip.
    const updatedPerClip: Record<number, PianoRollNote[]> = { ...perClipNotes };
    if (currentClipId !== null) {
      updatedPerClip[currentClipId] = currentNotes;
    }

    // Charger les notes du nouveau clip (ou [] si jamais édité).
    const newNotes = updatedPerClip[clipId] ?? [];
    updatedPerClip[clipId] = newNotes;

    set({
      isOpen: true,
      trackId,
      clipId,
      notes: newNotes,
      selectedNoteIds: new Set(),
      perClipNotes: updatedPerClip,
    });
  },

  close: () => {
    const { clipId, notes } = get();
    // Sauvegarder les notes dans perClipNotes avant de fermer.
    if (clipId !== null) {
      set((s) => ({
        isOpen: false,
        perClipNotes: { ...s.perClipNotes, [clipId]: notes },
      }));
    } else {
      set({ isOpen: false });
    }
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
    set((s) => ({
      notes,
      _nextNoteId: s._nextNoteId + 1,
      perClipNotes: { ...s.perClipNotes, [clipId]: notes },
    }));
    syncNotes(trackId, clipId, notes);
  },

  updateNote: (id, patch) => {
    const { trackId, clipId } = get();
    if (trackId === null || clipId === null) return;
    const notes = get().notes.map(n => n.id === id ? { ...n, ...patch } : n);
    set((s) => ({
      notes,
      perClipNotes: { ...s.perClipNotes, [clipId]: notes },
    }));
    syncNotes(trackId, clipId, notes);
  },

  deleteNotes: (ids) => {
    const { trackId, clipId } = get();
    if (trackId === null || clipId === null) return;
    const idSet = new Set(ids);
    const notes = get().notes.filter(n => !idSet.has(n.id));
    const selectedNoteIds = new Set([...get().selectedNoteIds].filter(id => !idSet.has(id)));
    set((s) => ({
      notes,
      selectedNoteIds,
      perClipNotes: { ...s.perClipNotes, [clipId]: notes },
    }));
    syncNotes(trackId, clipId, notes);
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

  selectAll: () => {
    const { notes } = get();
    set({ selectedNoteIds: new Set(notes.map(n => n.id)) });
  },

  copySelectedNotes: () => {
    const { notes, selectedNoteIds } = get();
    if (selectedNoteIds.size === 0) return;
    const selected = notes.filter(n => selectedNoteIds.has(n.id));
    set({ copiedNotes: selected });
  },

  pasteNotes: () => {
    const { copiedNotes, trackId, clipId, _nextNoteId } = get();
    if (copiedNotes.length === 0 || trackId === null || clipId === null) return;

    // Décaler les notes collées d'un quart de beat vers la droite.
    const offset = 0.25;
    let nextId = _nextNoteId;
    const pasted: PianoRollNote[] = copiedNotes.map(n => ({
      ...n,
      id: nextId++,
      startBeats: n.startBeats + offset,
    }));

    const notes = [...get().notes, ...pasted];
    set((s) => ({
      notes,
      _nextNoteId: nextId,
      selectedNoteIds: new Set(pasted.map(n => n.id)),
      perClipNotes: { ...s.perClipNotes, [clipId]: notes },
    }));
    syncNotes(trackId, clipId, notes);
  },

  restoreClipNotes: (allNotes, nextId) => {
    set({ perClipNotes: allNotes, _nextNoteId: nextId });
  },
}));
