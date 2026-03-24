import { create } from 'zustand';
import {
  newProject as newProjectCmd,
  saveProject as saveProjectCmd,
  loadProject as loadProjectCmd,
  getProjectPath,
  clearTimeline,
  addClipCmd,
  addMidiClip,
  updateMidiClipNotes,
  assignPadSample,
  type MspProject,
  type ProjectTrack,
  type ProjectClip,
  type ProjectInstrumentTrack,
  type MidiNoteData,
} from '../utils/tauri-commands';
import { useTracksStore } from './tracksStore';
import { usePadsStore } from './padsStore';
import { useDrumStore } from './drumStore';
import { useSynthStore } from './synthStore';
import { usePianoRollStore } from './pianoRollStore';
import type { PianoRollNote } from './pianoRollStore';
import { useTransportStore } from './transportStore';
import type { Track, Clip } from '../types/audio';

// ─── État ────────────────────────────────────────────────────────────────────

interface ProjectState {
  projectName: string | null;
  projectPath: string | null;
  isDirty: boolean;
  lastSavedAt: string | null;
  isProjectOpen: boolean;

  // Actions
  createNew: (name: string) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  closeProject: () => void;
  markDirty: () => void;
  /** Construit le MspProject depuis les stores courants (sans sauvegarder). */
  buildProject: () => MspProject;
  /** Construit le MspProject depuis les stores courants et le sauvegarde. */
  buildAndSave: (path: string) => Promise<void>;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/** Convertit les pistes audio/drum du tracksStore en ProjectTrack[] sérialisables. */
function buildProjectTracks(): ProjectTrack[] {
  const { tracks, clips } = useTracksStore.getState();
  return tracks
    .filter((t) => t.type !== 'instrument') // Les pistes instrument sont gérées séparément.
    .map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      volume: t.volume,
      pan: t.pan,
      muted: t.muted,
      solo: t.solo,
      track_type: t.type,
      // Les pistes DrumRack n'ont pas de clips audio — leur pattern est stocké séparément.
      clips: t.type === 'drum_rack'
        ? []
        : clips
            .filter((c) => c.trackId === t.id && c.type !== 'midi')
            .map((c): ProjectClip => ({
              id: c.id,
              sample_id: Number(c.sampleId),
              position: c.position,
              duration: c.duration,
              color: c.color,
            })),
    }));
}

/** Construit les pistes instrument avec leurs clips MIDI pour la sauvegarde. */
function buildInstrumentTracks(): ProjectInstrumentTrack[] {
  const { tracks, clips } = useTracksStore.getState();
  const pianoRollState = usePianoRollStore.getState();
  const synthState = useSynthStore.getState();
  const bpm = useTransportStore.getState().bpm;

  const instrTracks = tracks.filter((t) => t.type === 'instrument');
  if (instrTracks.length === 0) return [];

  return instrTracks.map((t) => {
    const midiClips = clips
      .filter((c) => c.trackId === t.id && c.type === 'midi' && c.midiClipId !== undefined)
      .map((c) => {
        const midiClipId = c.midiClipId!;
        // Notes : si ce clip est le clip actif du piano roll, utiliser les notes courantes.
        // Sinon, utiliser perClipNotes.
        let clipNotes: PianoRollNote[];
        if (pianoRollState.clipId === midiClipId) {
          clipNotes = pianoRollState.notes;
        } else {
          clipNotes = pianoRollState.perClipNotes[midiClipId] ?? [];
        }

        const startBeats = c.startBeats ?? (c.position * bpm / 60);
        const lengthBeats = c.lengthBeats ?? (c.duration * bpm / 60);

        return {
          frontend_clip_id: c.id,
          start_beats: startBeats,
          length_beats: lengthBeats,
          notes: clipNotes.map((n) => ({
            id: n.id,
            note: n.note,
            start_beats: n.startBeats,
            duration_beats: n.durationBeats,
            velocity: n.velocity,
          })),
        };
      });

    return {
      frontend_track_id: t.id,
      preset_name: synthState.activePresetName ?? undefined,
      midi_clips: midiClips,
    };
  });
}

/** Restaure les pistes/clips dans le tracksStore depuis un MspProject chargé. */
function restoreTracks(project: MspProject): void {
  const tracks: Track[] = project.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    type: (t.track_type as Track['type']) ?? 'audio',
    color: t.color,
    volume: t.volume,
    pan: t.pan,
    muted: t.muted,
    solo: t.solo,
  }));

  const clips: Clip[] = project.tracks.flatMap((t) =>
    t.clips.map((c): Clip => ({
      id: c.id,
      trackId: t.id,
      sampleId: String(c.sample_id),
      position: c.position,
      duration: c.duration,
      color: c.color,
      waveformData: [],
    }))
  );

  useTracksStore.getState().restoreState(tracks, clips);
}

/**
 * Envoie les clips restaurés au moteur audio.
 * Les IDs de clips restaurés commencent à 100000 pour éviter les conflits
 * avec les IDs générés dynamiquement (qui commencent à 100).
 */
async function syncRestoredClipsToEngine(project: MspProject): Promise<void> {
  await clearTimeline();
  for (let trackIdx = 0; trackIdx < project.tracks.length; trackIdx++) {
    const track = project.tracks[trackIdx];
    for (const clip of track.clips) {
      const numId = extractNumericId(clip.id);
      try {
        await addClipCmd(numId, clip.sample_id, clip.position, clip.duration, trackIdx);
      } catch (e) {
        console.warn('[ProjectStore] syncClip error', clip.id, e);
      }
    }
  }
}

/** Restaure les pads depuis un MspProject chargé. */
function restorePads(project: MspProject): void {
  const padsState = usePadsStore.getState();
  for (const pad of project.pads) {
    if (pad.sample_id !== null) {
      // setPadName : met à jour le store sans appeler le backend
      padsState.setPadName(pad.id, pad.sample_id, `Sample ${pad.sample_id}`);
      // Notifie aussi le moteur audio
      assignPadSample(pad.id, pad.sample_id).catch(() => {});
    }
  }
}

/** Restaure les pistes instrument (synthé + clips MIDI) depuis un projet chargé. */
async function restoreInstrumentTracks(project: MspProject): Promise<void> {
  if (!project.instrument_tracks || project.instrument_tracks.length === 0) return;

  const bpm = project.bpm;

  // Initialiser le synthé si ce n'est pas déjà fait.
  const synthStore = useSynthStore.getState();
  if (synthStore.trackId === null) {
    await synthStore.init();
  }
  const rustTrackId = useSynthStore.getState().trackId;
  if (rustTrackId === null) {
    console.warn('[ProjectStore] Impossible d\'initialiser le synthé pour la restauration');
    return;
  }

  const perClipNotes: Record<number, PianoRollNote[]> = {};
  let maxNoteId = 0;

  for (const instrTrack of project.instrument_tracks) {
    // Ajouter la piste instrument dans le tracksStore si absente.
    const { tracks, clips: existingClips } = useTracksStore.getState();
    let frontendTrack = tracks.find((t) => t.id === instrTrack.frontend_track_id);

    if (!frontendTrack) {
      // La piste n'existe pas encore (nouveau projet ou réinitialisation).
      // Chercher une piste instrument existante ou en créer une.
      frontendTrack = tracks.find((t) => t.type === 'instrument');
      if (!frontendTrack) {
        console.warn('[ProjectStore] Piste instrument introuvable :', instrTrack.frontend_track_id);
        continue;
      }
    }

    // Charger le preset si présent.
    if (instrTrack.preset_name && instrTrack.preset_name.length > 0) {
      synthStore.loadPreset(instrTrack.preset_name).catch(console.error);
    }

    for (const clipData of instrTrack.midi_clips) {
      // Créer le clip MIDI dans le moteur Rust (obtient un nouvel ID).
      let rustClipId: number;
      try {
        rustClipId = await addMidiClip(rustTrackId, clipData.start_beats, clipData.length_beats);
      } catch (err) {
        console.warn('[ProjectStore] addMidiClip error:', err);
        continue;
      }

      // Restaurer les notes du clip.
      const notes: PianoRollNote[] = clipData.notes.map((n) => {
        if (n.id > maxNoteId) maxNoteId = n.id;
        return {
          id: n.id,
          note: n.note,
          startBeats: n.start_beats,
          durationBeats: n.duration_beats,
          velocity: n.velocity,
        };
      });

      if (notes.length > 0) {
        const noteData: MidiNoteData[] = notes.map((n) => ({
          id: n.id,
          note: n.note,
          start_beats: n.startBeats,
          duration_beats: n.durationBeats,
          velocity: n.velocity,
        }));
        await updateMidiClipNotes(rustTrackId, rustClipId, noteData).catch(console.error);
      }

      perClipNotes[rustClipId] = notes;

      // Ajouter le clip dans le tracksStore frontend.
      const durationSecs = clipData.length_beats * (60 / bpm);
      const posSecs = clipData.start_beats * (60 / bpm);

      // Éviter les doublons si le clip existe déjà.
      const alreadyExists = existingClips.some(
        (c) => c.trackId === frontendTrack!.id && c.type === 'midi'
          && Math.abs(c.position - posSecs) < 0.01
      );
      if (!alreadyExists) {
        const newClip: Clip = {
          id: clipData.frontend_clip_id || `midi-clip-${rustClipId}`,
          trackId: frontendTrack.id,
          sampleId: '',
          position: posSecs,
          duration: durationSecs,
          color: frontendTrack.color,
          waveformData: [],
          type: 'midi',
          midiClipId: rustClipId,
          startBeats: clipData.start_beats,
          lengthBeats: clipData.length_beats,
        };
        useTracksStore.getState().addClip(newClip);
      }
    }
  }

  // Restaurer les notes dans le pianoRollStore.
  usePianoRollStore.getState().restoreClipNotes(perClipNotes, maxNoteId + 1);
}

/** Extrait la partie numérique d'un ID de clip frontend (ex: "clip-42" → 42). */
function extractNumericId(clipId: string): number {
  const m = clipId.match(/\d+/);
  return m ? Number(m[0]) : 100000 + Math.floor(Math.random() * 10000);
}

// ─── Store ────────────────────────────────────────────────────────────────────

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projectName: null,
  projectPath: null,
  isDirty: false,
  lastSavedAt: null,
  isProjectOpen: false,

  createNew: async (name: string) => {
    // Crée la structure côté Rust
    await newProjectCmd(name);
    // Calcule le chemin de sauvegarde
    const path = await getProjectPath(name);

    // Réinitialise les stores
    useTracksStore.getState().restoreState([], []);
    await clearTimeline();

    // Sauvegarde immédiate (fichier vide)
    const project: MspProject = {
      version: '1.0',
      name,
      profile_id: 'default',
      level_created_at: 1,
      bpm: 120,
      tracks: [],
      pads: Array.from({ length: 16 }, (_, i) => ({ id: i, sample_id: i })),
    };
    await saveProjectCmd(path, project);

    set({
      projectName: name,
      projectPath: path,
      isDirty: false,
      lastSavedAt: new Date().toISOString(),
      isProjectOpen: true,
    });

    startAutoSave(get);
  },

  openProject: async (path: string) => {
    const project = await loadProjectCmd(path);

    // Restaure les stores
    restoreTracks(project);
    restorePads(project);
    await syncRestoredClipsToEngine(project);

    // Restaure le pattern drum rack si présent.
    if (project.drum_pattern) {
      useDrumStore.getState().applyPattern(project.drum_pattern);
    }

    // Restaure les pistes instrument (synthé + MIDI clips).
    await restoreInstrumentTracks(project);

    set({
      projectName: project.name,
      projectPath: path,
      isDirty: false,
      lastSavedAt: new Date().toISOString(),
      isProjectOpen: true,
    });

    startAutoSave(get);
  },

  saveCurrentProject: async () => {
    const { projectPath, buildAndSave } = get();
    if (!projectPath) return;
    await buildAndSave(projectPath);
  },

  saveAs: async (name: string) => {
    const path = await getProjectPath(name);
    const { buildAndSave } = get();
    await buildAndSave(path);
    set({ projectName: name, projectPath: path });
  },

  buildProject: () => {
    const { projectName } = get();
    const { pads } = usePadsStore.getState();
    const { steps, velocities, stepCount } = useDrumStore.getState();
    const bpm = useTransportStore.getState().bpm;
    return {
      version: '1.0',
      name: projectName ?? 'Sans titre',
      profile_id: 'default',
      level_created_at: 1,
      bpm,
      tracks: buildProjectTracks(),
      pads: pads.map((p) => ({ id: p.id, sample_id: p.sampleId })),
      drum_pattern: {
        steps: stepCount,
        pads: steps.map((row) => row.slice(0, stepCount)),
        velocities: velocities.map((row) => row.slice(0, stepCount)),
      },
      instrument_tracks: buildInstrumentTracks(),
    };
  },

  buildAndSave: async (path: string) => {
    const { buildProject } = get();
    const project = buildProject();
    await saveProjectCmd(path, project);
    set({ isDirty: false, lastSavedAt: new Date().toISOString() });
  },

  closeProject: () => {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
    set({
      projectName: null,
      projectPath: null,
      isDirty: false,
      lastSavedAt: null,
      isProjectOpen: false,
    });
  },

  markDirty: () => set({ isDirty: true }),
}));

function startAutoSave(get: () => ProjectState) {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(async () => {
    const { isDirty, saveCurrentProject } = get();
    if (isDirty) {
      try {
        await saveCurrentProject();
        console.log('[ProjectStore] Auto-sauvegarde effectuée');
      } catch (e) {
        console.warn('[ProjectStore] Auto-sauvegarde échouée', e);
      }
    }
  }, 2 * 60 * 1000); // toutes les 2 minutes
}
