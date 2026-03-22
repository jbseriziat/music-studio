import { useCallback, useState } from 'react';
import { previewSample, stopPreview } from '../../utils/tauri-commands';
import styles from './SamplePreview.module.css';

interface Props {
  sampleId: number;
  sampleName: string;
}

/**
 * Bouton de prévisualisation d'un sample.
 * Appuyer joue le son une fois. Appuyer à nouveau l'arrête.
 */
export function SamplePreview({ sampleId, sampleName }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (isPlaying) {
        await stopPreview();
        setIsPlaying(false);
      } else {
        await previewSample(sampleId);
        setIsPlaying(true);
        // Réinitialiser l'état après un délai raisonnable (le son finit)
        setTimeout(() => setIsPlaying(false), 3000);
      }
    } catch (err) {
      console.error('[SamplePreview] error', err);
      setIsPlaying(false);
    }
  }, [sampleId, isPlaying]);

  return (
    <button
      className={`${styles.btn} ${isPlaying ? styles.playing : ''}`}
      onClick={handleClick}
      title={isPlaying ? 'Arrêter' : `Écouter ${sampleName}`}
      aria-label={isPlaying ? `Arrêter ${sampleName}` : `Écouter ${sampleName}`}
      aria-pressed={isPlaying}
    >
      {isPlaying ? '■' : '▶'}
    </button>
  );
}
