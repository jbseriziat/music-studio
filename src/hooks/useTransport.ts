import { useCallback, useEffect } from 'react';
import { useTransportStore } from '../stores/transportStore';
import { useProjectStore } from '../stores/projectStore';
import { useTracksStore } from '../stores/tracksStore';
import {
  setMasterVolume, setPositionCmd,
  getArmedTrack, loadSample, addClipCmd,
} from '../utils/tauri-commands';
import type { Clip } from '../types/audio';

/**
 * Hook centralisant le contrôle du transport.
 * Délègue play/pause/stop au transportStore (qui gère l'IPC).
 * Poll la position toutes les 50ms pendant la lecture via store.syncPosition().
 */

/** Compteur pour les IDs de clips issus de l'enregistrement. */
let recClipCounter = 900000;

export function useTransport() {
  const store = useTransportStore();
  const projectName = useProjectStore((s) => s.projectName);

  // Polling de la position pendant la lecture (50ms).
  useEffect(() => {
    if (!store.isPlaying) return;
    const interval = setInterval(() => {
      store.syncPosition();
    }, 50);
    return () => clearInterval(interval);
  }, [store.isPlaying, store.syncPosition]);

  /** Repositionne le curseur à une position en secondes. */
  const seekTo = useCallback(async (secs: number) => {
    try {
      await setPositionCmd(secs);
      store.setPosition(secs);
    } catch (e) {
      console.error('[Transport] seekTo error', e);
    }
  }, [store]);

  /** Met à jour le BPM dans le store + IPC (délégué au store). */
  const setBpm = useCallback((bpm: number) => {
    store.setBpm(bpm);
  }, [store]);

  /** Ajuste le volume master via IPC. */
  const setVolume = useCallback(async (volume: number) => {
    await setMasterVolume(volume);
  }, []);

  /**
   * Bascule l'état d'enregistrement (Phase 4+).
   * — Si en cours : arrête, charge le WAV et ajoute un clip sur la piste armée.
   * — Sinon : démarre l'enregistrement.
   */
  const toggleRecording = useCallback(async () => {
    if (store.isRecording) {
      // ── Arrêter l'enregistrement ─────────────────────────────────────────
      const wavPath = await store.stopRecording(projectName ?? 'default');
      if (!wavPath) return;

      try {
        // Charger le WAV dans la banque de samples.
        const sampleInfo = await loadSample(wavPath);

        // Trouver la piste cible : piste armée (par son index) ou première piste audio.
        const armedIdx = await getArmedTrack();
        const { tracks, addClip: storeAddClip } = useTracksStore.getState();

        let targetTrack = armedIdx !== null ? tracks[armedIdx] : null;
        if (!targetTrack || targetTrack.type !== 'audio') {
          targetTrack = tracks.find((t) => t.type === 'audio') ?? null;
        }

        if (targetTrack) {
          const trackIdx = tracks.indexOf(targetTrack);
          const newClipId = `rec-${++recClipCounter}`;
          const durationSecs = sampleInfo.duration_ms / 1000;

          // Ajouter dans le store frontend.
          const newClip: Clip = {
            id: newClipId,
            trackId: targetTrack.id,
            sampleId: String(sampleInfo.id),
            sampleName: sampleInfo.name,
            position: 0,
            duration: durationSecs,
            color: targetTrack.color,
            waveformData: sampleInfo.waveform,
            type: 'audio',
          };
          storeAddClip(newClip);

          // Synchroniser avec le moteur audio.
          await addClipCmd(recClipCounter, sampleInfo.id, 0, durationSecs, trackIdx);
        }
      } catch (e) {
        console.error('[Transport] recording import error', e);
      }
    } else {
      // ── Démarrer l'enregistrement ─────────────────────────────────────────
      await store.startRecording();
    }
  }, [store, projectName]);

  return {
    isPlaying: store.isPlaying,
    isRecording: store.isRecording,
    position: store.position,
    bpm: store.bpm,
    loopEnabled: store.loopEnabled,
    metronomeEnabled: store.metronomeEnabled,
    // Actions IPC (déléguées au store)
    play: store.play,
    pause: store.pause,
    stop: store.stop,
    // Actions locales
    seekTo,
    setBpm,
    setVolume,
    toggleRecording,
    toggleMetronome: store.toggleMetronome,
  };
}
