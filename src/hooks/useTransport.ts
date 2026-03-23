import { useCallback, useEffect } from 'react';
import { useTransportStore } from '../stores/transportStore';
import { setMasterVolume, setPositionCmd } from '../utils/tauri-commands';

/**
 * Hook centralisant le contrôle du transport.
 * Délègue play/pause/stop au transportStore (qui gère l'IPC).
 * Poll la position toutes les 50ms pendant la lecture via store.syncPosition().
 */
export function useTransport() {
  const store = useTransportStore();

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

  /** Bascule l'état d'enregistrement (IPC Phase 4+). */
  const toggleRecording = useCallback(() => {
    store.setRecording(!store.isRecording);
    // TODO Phase 4 : invoke('arm_track', ...) + recording logic
  }, [store]);

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
