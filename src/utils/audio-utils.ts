/**
 * Convertit un numéro de note MIDI (0–127) en fréquence Hz.
 * Référence : A4 = note 69 = 440 Hz
 */
export function midiNoteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * Convertit une fréquence Hz en numéro de note MIDI le plus proche.
 */
export function freqToMidiNote(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

/**
 * Convertit un volume linéaire (0.0–1.0) en décibels.
 * Retourne -Infinity pour 0.
 */
export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/**
 * Convertit des décibels en volume linéaire (0.0–1.0).
 */
export function dbToLinear(db: number): number {
  if (!isFinite(db)) return 0;
  return Math.pow(10, db / 20);
}

/**
 * Formate un temps en secondes au format MM:SS.
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Formate une position en beats au format Mesure.Temps (ex: "3.2").
 */
export function formatBeats(beats: number, beatsPerBar = 4): string {
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = Math.floor(beats % beatsPerBar) + 1;
  return `${bar}.${beat}`;
}

/**
 * Calcule le nombre de samples par beat à partir du BPM et du sample rate.
 */
export function samplesPerBeat(bpm: number, sampleRate: number): number {
  return (sampleRate * 60) / bpm;
}

/**
 * Calcule le nombre de samples par step (1/16e de mesure).
 */
export function samplesPerStep(bpm: number, sampleRate: number): number {
  return samplesPerBeat(bpm, sampleRate) / 4;
}

/**
 * Clampe une valeur entre min et max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
