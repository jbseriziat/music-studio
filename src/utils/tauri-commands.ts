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
  /** Pattern du drum rack, absent dans les anciens projets. */
  drum_pattern?: DrumPatternDto;
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
  /** Type de la piste : "audio" | "drum_rack" | "instrument". Absent = "audio". */
  track_type?: string;
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
  trackId: number,
): Promise<void> =>
  invoke<void>('add_clip', { clipId, sampleId, positionSecs, durationSecs, trackId });

/** Configure la zone de boucle (en secondes). */
export const setLoopCmd = (enabled: boolean, startSecs: number, endSecs: number): Promise<void> =>
  invoke<void>('set_loop', { enabled, startSecs, endSecs });

/** Active/désactive le mute d'une piste (trackId = index 0-based). */
export const setTrackMuteCmd = (trackId: number, muted: boolean): Promise<void> =>
  invoke<void>('set_track_mute', { trackId, muted });

/** Active/désactive le solo d'une piste. */
export const setTrackSoloCmd = (trackId: number, solo: boolean): Promise<void> =>
  invoke<void>('set_track_solo', { trackId, solo });

/** Ajuste le volume du métronome (0.0–1.0). */
export const setMetronomeVolumeCmd = (volume: number): Promise<void> =>
  invoke<void>('set_metronome_volume', { volume });

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

// ─── Drum Rack & Séquenceur ───────────────────────────────────────────────────

export interface DrumPatternDto {
  steps: number;
  pads: boolean[][];        // [pad][step]
  velocities: number[][];   // [pad][step]
}

/** Définit le BPM (20–300). */
export const setBpmCmd = (bpm: number): Promise<void> =>
  invoke<void>('set_bpm', { bpm });

/** Retourne le BPM actuel depuis le moteur audio. */
export const getBpm = (): Promise<number> =>
  invoke<number>('get_bpm');

/** Active ou désactive un step pour un pad. velocity ∈ [0.0, 1.0]. */
export const setDrumStep = (pad: number, step: number, active: boolean, velocity = 1.0): Promise<void> =>
  invoke<void>('set_drum_step', { pad, step, active, velocity });

/** Assigne un sample à un pad du drum rack. */
export const assignDrumPad = (pad: number, sampleId: number): Promise<void> =>
  invoke<void>('assign_drum_pad', { pad, sampleId });

/** Déclenche immédiatement un pad du drum rack. */
export const triggerDrumPadCmd = (pad: number): Promise<void> =>
  invoke<void>('trigger_drum_pad', { pad });

/** Active ou désactive le métronome. */
export const setMetronomeCmd = (enabled: boolean): Promise<void> =>
  invoke<void>('set_metronome', { enabled });

/** Retourne le step courant du séquenceur (0–31). */
export const getCurrentStep = (): Promise<number> =>
  invoke<number>('get_current_step');

/** Définit le nombre de steps du pattern (8, 16, 32). */
export const setDrumStepCount = (count: number): Promise<void> =>
  invoke<void>('set_drum_step_count', { count });

/** Remplace tout le pattern d'un coup (chargement projet/preset). */
export const setDrumPattern = (pattern: DrumPatternDto): Promise<void> =>
  invoke<void>('set_drum_pattern', { pattern });

// ─── Kits & réglages par pad ──────────────────────────────────────────────────

export interface DrumKitInfo {
  name: string;
  display_name: string;
}

export interface DrumPadConfigDto {
  sample_id: number;
  volume: number;
  pitch_semitones: number;
  name: string;
}

/** Ajuste le volume d'un pad (0.0–2.0). */
export const setDrumPadVolume = (pad: number, volume: number): Promise<void> =>
  invoke<void>('set_drum_pad_volume', { pad, volume });

/** Transpose un pad en demi-tons (−12 à +12). */
export const setDrumPadPitch = (pad: number, pitchSemitones: number): Promise<void> =>
  invoke<void>('set_drum_pad_pitch', { pad, pitchSemitones });

/** Charge un kit prédéfini. Retourne les 8 configs de pads mises à jour. */
export const loadDrumKitCmd = (kitName: string): Promise<DrumPadConfigDto[]> =>
  invoke<DrumPadConfigDto[]>('load_drum_kit', { kitName });

/** Retourne la liste des kits intégrés. */
export const listDrumKits = (): Promise<DrumKitInfo[]> =>
  invoke<DrumKitInfo[]>('list_drum_kits');

// ─── Synthétiseur ─────────────────────────────────────────────────────────────

export interface PresetInfo {
  name: string;
  waveform: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  cutoff: number;
  resonance: number;
}

/** Crée une piste instrument avec synthé. Retourne le trackId Rust (≥ 100). */
export const createSynthTrack = (name: string): Promise<number> =>
  invoke<number>('create_synth_track', { name });

/** Déclenche une note (note_on) sur la piste synthé. velocity ∈ [0, 127]. */
export const noteOnCmd = (trackId: number, note: number, velocity: number): Promise<void> =>
  invoke<void>('note_on', { trackId, note, velocity });

/** Relâche une note (note_off) sur la piste synthé. */
export const noteOffCmd = (trackId: number, note: number): Promise<void> =>
  invoke<void>('note_off', { trackId, note });

/**
 * Modifie un paramètre du synthé.
 * param : "waveform" | "attack" | "decay" | "sustain" | "release" |
 *         "cutoff" | "resonance" | "octave" | "detune" | "volume"
 */
export const setSynthParam = (trackId: number, param: string, value: number): Promise<void> =>
  invoke<void>('set_synth_param', { trackId, param, value });

/** Charge un preset intégré par nom. */
export const loadSynthPresetCmd = (trackId: number, presetName: string): Promise<void> =>
  invoke<void>('load_synth_preset', { trackId, presetName });

/** Retourne la liste des presets intégrés. */
export const listSynthPresets = (): Promise<PresetInfo[]> =>
  invoke<PresetInfo[]>('list_synth_presets');

// ─── Piano Roll / MIDI clips ──────────────────────────────────────────────────

/** Une note MIDI à envoyer au backend (snake_case = serde côté Rust). */
export interface MidiNoteData {
  id: number;
  note: number;           // 0–127 (60 = C4)
  start_beats: number;    // position relative au début du clip, en beats
  duration_beats: number; // durée en beats
  velocity: number;       // 0–127
}

/** Crée un clip MIDI vide sur la piste instrument. Retourne l'ID du clip. */
export const addMidiClip = (trackId: number, startBeats: number, lengthBeats: number): Promise<number> =>
  invoke<number>('add_midi_clip', { trackId, startBeats, lengthBeats });

/** Remplace toutes les notes d'un clip (appelé à chaque modification depuis le piano roll). */
export const updateMidiClipNotes = (trackId: number, clipId: number, notes: MidiNoteData[]): Promise<void> =>
  invoke<void>('update_midi_clip_notes', { trackId, clipId, notes });

/** Supprime un clip MIDI. */
export const deleteMidiClip = (trackId: number, clipId: number): Promise<void> =>
  invoke<void>('delete_midi_clip', { trackId, clipId });
