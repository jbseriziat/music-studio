import { useCallback, useEffect } from 'react';
import { useTransportStore } from '../stores/transportStore';
import {
  playAudio,
  pauseAudio,
  stopAudio,
  setMasterVolume,
  getPosition,
  setPositionCmd,
} from '../utils/tauri-commands';

/**
 * Hook centralisant le contrôle du transport.
 * Synchronise le store Zustand avec les commandes Rust.
 * Poll la position toutes les 50ms pendant la lecture.
 */
export function useTransport() {
  const store = useTransportStore();

  // Polling de la position pendant la lecture.
  useEffect(() => {
    if (!store.isPlaying) return;
    const interval = setInterval(async () => {
      try {
        const pos = await getPosition();
        store.setPosition(pos);
      } catch {
        // Ignorer les erreurs de polling
      }
    }, 50);
    return () => clearInterval(interval);
  }, [store.isPlaying, store]);

  const play = useCallback(async () => {
    try {
      await playAudio();
      store.setPlaying(true);
    } catch (e) {
      console.error('[Transport] play error', e);
    }
  }, [store]);

  const pause = useCallback(async () => {
    try {
      await pauseAudio();
      store.setPlaying(false);
    } catch (e) {
      console.error('[Transport] pause error', e);
    }
  }, [store]);

  const stop = useCallback(async () => {
    try {
      await stopAudio();
      store.setPlaying(false);
      store.setPosition(0);
    } catch (e) {
      console.error('[Transport] stop error', e);
    }
  }, [store]);

  const seekTo = useCallback(async (secs: number) => {
    try {
      await setPositionCmd(secs);
      store.setPosition(secs);
    } catch (e) {
      console.error('[Transport] seekTo error', e);
    }
  }, [store]);

  const setBpm = useCallback((bpm: number) => {
    store.setBpm(bpm);
    // TODO Phase 2 : invoke('set_bpm', { bpm })
  }, [store]);

  const setVolume = useCallback(async (volume: number) => {
    await setMasterVolume(volume);
  }, []);

  return {
    isPlaying: store.isPlaying,
    position: store.position,
    bpm: store.bpm,
    loopEnabled: store.loopEnabled,
    play,
    pause,
    stop,
    seekTo,
    setBpm,
    setVolume,
  };
}
