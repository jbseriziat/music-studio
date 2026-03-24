import { PIXELS_PER_BEAT } from './NoteGrid';

/** Convertit une position en beats en pixels X. */
export function beatsToX(beats: number): number {
  return beats * PIXELS_PER_BEAT;
}

/** Convertit une position X en pixels en beats. */
export function xToBeats(x: number): number {
  return x / PIXELS_PER_BEAT;
}
