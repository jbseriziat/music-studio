import { create } from 'zustand';
import {
  newProject as newProjectCmd,
  saveProject as saveProjectCmd,
  loadProject as loadProjectCmd,
  getProjectPath,
  clearTimeline,
  addClipCmd,
  assignPadSample,
  type MspProject,
  type ProjectTrack,
  type ProjectClip,
} from '../utils/tauri-commands';
import { useTracksStore } from './tracksStore';
import { usePadsStore } from './padsStore';
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
  /** Construit le MspProject depuis les stores courants et le sauvegarde. */
  buildAndSave: (path: string) => Promise<void>;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/** Convertit les pistes du tracksStore en ProjectTrack[] sérialisables. */
function buildProjectTracks(): ProjectTrack[] {
  const { tracks, clips } = useTracksStore.getState();
  return tracks.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    volume: t.volume,
    pan: t.pan,
    muted: t.muted,
    solo: t.solo,
    clips: clips
      .filter((c) => c.trackId === t.id)
      .map((c): ProjectClip => ({
        id: c.id,
        sample_id: Number(c.sampleId),
        position: c.position,
        duration: c.duration,
        color: c.color,
      })),
  }));
}

/** Restaure les pistes/clips dans le tracksStore depuis un MspProject chargé. */
function restoreTracks(project: MspProject): void {
  const tracks: Track[] = project.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    type: 'audio' as const,
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

  buildAndSave: async (path: string) => {
    const { projectName } = get();
    const { pads } = usePadsStore.getState();

    const project: MspProject = {
      version: '1.0',
      name: projectName ?? 'Sans titre',
      profile_id: 'default',
      level_created_at: 1,
      bpm: 120,
      tracks: buildProjectTracks(),
      pads: pads.map((p) => ({ id: p.id, sample_id: p.sampleId })),
    };

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
