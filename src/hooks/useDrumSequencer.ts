import { useEffect } from 'react';
import { useTransportStore } from '../stores/transportStore';
import { useDrumStore } from '../stores/drumStore';
import { getCurrentStep } from '../utils/tauri-commands';

/**
 * Poll le step courant du séquenceur toutes les 40ms pendant la lecture.
 * Met à jour drumStore.currentStep pour animer le curseur de l'UI.
 */
export function useDrumSequencer() {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const setCurrentStep = useDrumStore((s) => s.setCurrentStep);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(async () => {
      try {
        const step = await getCurrentStep();
        setCurrentStep(step);
      } catch {
        // Ignorer silencieusement
      }
    }, 40);
    return () => clearInterval(interval);
  }, [isPlaying, setCurrentStep]);
}
