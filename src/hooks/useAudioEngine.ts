import { useState, useCallback } from 'react';
import {
  playAudio,
  pauseAudio,
  stopAudio,
  setMasterVolume,
  pingAudio,
} from '../utils/tauri-commands';

interface AudioEngineState {
  isPlaying: boolean;
  volume: number;   // 0.0 – 1.0
  error: string | null;
}

export function useAudioEngine() {
  const [state, setState] = useState<AudioEngineState>({
    isPlaying: false,
    volume: 1.0,
    error: null,
  });

  const play = useCallback(async () => {
    try {
      await playAudio();
      setState((s) => ({ ...s, isPlaying: true, error: null }));
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      await pauseAudio();
      setState((s) => ({ ...s, isPlaying: false, error: null }));
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await stopAudio();
      setState((s) => ({ ...s, isPlaying: false, error: null }));
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    try {
      await setMasterVolume(volume);
      setState((s) => ({ ...s, volume, error: null }));
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }, []);

  const ping = useCallback((): Promise<string> => pingAudio(), []);

  return {
    ...state,
    play,
    pause,
    stop,
    setVolume,
    ping,
  };
}
