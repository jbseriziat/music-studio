import { invoke } from '@tauri-apps/api/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioDevice {
  name: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
}

export interface ProjectSummary {
  name: string;
  path: string;
  modified_at: number;  // Unix timestamp en secondes
  bpm: number;
}

export interface SampleInfo {
  id: number;
  name: string;
  category: string;
  path: string;
  duration_ms: number;
  waveform: number[];
  tags: string[];
}

export interface MspProject {
  version: string;
  name: string;
  profile_id: string;
  level_created_at: number;
  bpm: number;
  tracks: ProjectTrack[];
  pads: ProjectPad[];
}

export interface ProjectTrack {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  clips: ProjectClip[];
}

export interface ProjectClip {
  id: string;
  sample_id: number;
  position: number;
  duration: number;
  color: string;
}

export interface ProjectPad {
  id: number;
  sample_id: number | null;
}

// ─── IPC de test ──────────────────────────────────────────────────────────────

export const ping = (message: string): Promise<string> =>
  invoke<string>('ping', { message });

export const pingAudio = (): Promise<string> =>
  invoke<string>('ping_audio');

// ─── Transport audio ──────────────────────────────────────────────────────────

export const playAudio = (): Promise<void> => invoke<void>('play');
export const pauseAudio = (): Promise<void> => invoke<void>('pause');
export const stopAudio = (): Promise<void> => invoke<void>('stop');

export const setMasterVolume = (volume: number): Promise<void> =>
  invoke<void>('set_master_volume', { volume });

export const getPosition = (): Promise<number> =>
  invoke<number>('get_position');

export const setPositionCmd = (positionSecs: number): Promise<void> =>
  invoke<void>('set_position', { positionSecs });

// ─── Clips ────────────────────────────────────────────────────────────────────

export const addClipCmd = (
  clipId: number,
  sampleId: number,
  positionSecs: number,
  durationSecs: number,
): Promise<void> =>
  invoke<void>('add_clip', { clipId, sampleId, positionSecs, durationSecs });

export const moveClipCmd = (clipId: number, newPositionSecs: number): Promise<void> =>
  invoke<void>('move_clip', { clipId, newPositionSecs });

export const deleteClipCmd = (clipId: number): Promise<void> =>
  invoke<void>('delete_clip', { clipId });

export const clearTimeline = (): Promise<void> =>
  invoke<void>('clear_timeline');

// ─── Pads & samples ───────────────────────────────────────────────────────────

export const triggerPad = (padId: number): Promise<void> =>
  invoke<void>('trigger_pad', { padId });

export const assignPadSample = (padId: number, sampleId: number): Promise<void> =>
  invoke<void>('assign_pad_sample', { padId, sampleId });

export const listSamples = (category?: string): Promise<SampleInfo[]> =>
  invoke<SampleInfo[]>('list_samples', { category: category ?? null });

export const previewSample = (sampleId: number): Promise<void> =>
  invoke<void>('preview_sample', { sampleId });

export const stopPreview = (): Promise<void> =>
  invoke<void>('stop_preview');

export const getPadConfig = (): Promise<(number | null)[]> =>
  invoke<(number | null)[]>('get_pad_config');

/** Charge un fichier WAV depuis un chemin absolu, l'ajoute à la banque et retourne ses infos. */
export const loadSample = (path: string): Promise<SampleInfo> =>
  invoke<SampleInfo>('load_sample', { path });

// ─── Périphériques ────────────────────────────────────────────────────────────

export const getAudioDevices = (): Promise<AudioDevice[]> =>
  invoke<AudioDevice[]>('get_audio_devices');

// ─── Profils ──────────────────────────────────────────────────────────────────

export const getProfiles = (): Promise<unknown[]> =>
  invoke<unknown[]>('get_profiles');

export const saveProfiles = (profiles: unknown): Promise<void> =>
  invoke<void>('save_profiles', { profiles });

// ─── Projet ───────────────────────────────────────────────────────────────────

export const newProject = (name: string): Promise<MspProject> =>
  invoke<MspProject>('new_project', { name });

export const saveProject = (path: string, project: MspProject): Promise<void> =>
  invoke<void>('save_project', { path, project });

export const loadProject = (path: string): Promise<MspProject> =>
  invoke<MspProject>('load_project', { path });

export const listProjects = (): Promise<ProjectSummary[]> =>
  invoke<ProjectSummary[]>('list_projects');

export const getProjectsDir = (): Promise<string> =>
  invoke<string>('get_projects_dir');

export const getProjectPath = (name: string): Promise<string> =>
  invoke<string>('get_project_path', { name });

export const deleteProjectFile = (path: string): Promise<void> =>
  invoke<void>('delete_project', { path });
