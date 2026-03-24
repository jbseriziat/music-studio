// Format audio interne : f32, 48000 Hz, stéréo, buffer 512 frames
export interface AudioConfig {
  sampleRate: number;  // 48000
  bufferSize: number;  // 512
  channels: number;    // 2 (stéréo)
  bitDepth: number;    // 32 (float interne)
}

// Informations sur un sample (Phase 1)
export interface SampleInfo {
  id: number;
  name: string;
  category: string;
  path: string;
  durationMs: number;
  waveform: number[];  // 128 points pré-calculés pour l'affichage
  tags: string[];
}

// Piste sur la timeline
export interface Track {
  id: string;
  name: string;
  type: 'audio' | 'drum_rack' | 'instrument';
  color: string;
  volume: number;   // 0.0 – 1.0
  pan: number;      // -1.0 (gauche) à +1.0 (droite)
  muted: boolean;
  solo: boolean;
}

// Clip audio sur la timeline (Phase 1) ou MIDI (Phase 3)
export interface Clip {
  id: string;
  trackId: string;
  sampleId: string;
  sampleName?: string;   // Nom affiché dans le clip
  position: number;     // en secondes (audio) ou secondes converties depuis beats (MIDI)
  duration: number;     // en secondes
  color: string;
  waveformData: number[];
  /** Type du clip : 'audio' (défaut) ou 'midi'. */
  type?: 'audio' | 'midi';
  /** ID du clip MIDI côté Rust (utilisé pour le piano roll). Défini si type === 'midi'. */
  midiClipId?: number;
  /** Position en beats (pour les clips MIDI, stockée pour la sauvegarde). */
  startBeats?: number;
  /** Durée en beats (pour les clips MIDI, stockée pour la sauvegarde). */
  lengthBeats?: number;
}

// Pattern de séquenceur pas-à-pas (Phase 2)
export interface DrumPattern {
  id: string;
  name: string;
  steps: number;         // 8, 16 ou 32
  resolution: number;    // 1/16 par défaut
  pads: Record<number, {
    steps: boolean[];
    velocities: number[];  // 0–127 par step
  }>;
}

// Note MIDI individuelle (Phase 3)
export interface MidiNote {
  id: string;
  note: number;      // 0–127 (60 = C4)
  start: number;     // position en beats
  duration: number;  // durée en beats
  velocity: number;  // 0–127
}

// Clip MIDI sur la timeline (Phase 3)
export interface MidiClip {
  id: string;
  trackId: string;
  notes: MidiNote[];
  startInTimeline: number;  // position en beats
  length: number;           // longueur en beats
  color: string;
}
