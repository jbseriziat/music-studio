import { useCallback } from 'react';
import type { SampleInfo } from '../../utils/tauri-commands';
import { previewSample } from '../../utils/tauri-commands';
import styles from './SampleList.module.css';

interface Props {
  samples: SampleInfo[];
}

function formatDuration(ms: number): string {
  const s = ms / 1000;
  return s < 1 ? `${ms}ms` : `${s.toFixed(1)}s`;
}

export function SampleList({ samples }: Props) {
  const handlePreview = useCallback(async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await previewSample(id);
    } catch (err) {
      console.error('[SampleList] preview error', err);
    }
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, sample: SampleInfo) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'sample',
        sampleId: sample.id,
        sampleName: sample.name,
        durationMs: sample.duration_ms,
        waveform: sample.waveform,
      })
    );
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  if (samples.length === 0) {
    return <div className={styles.empty}>Chargement…</div>;
  }

  return (
    <div className={styles.list}>
      {samples.map(sample => (
        <div
          key={sample.id}
          className={styles.item}
          draggable
          onDragStart={e => handleDragStart(e, sample)}
        >
          <span className={styles.name}>{sample.name}</span>
          <span className={styles.duration}>{formatDuration(sample.duration_ms)}</span>
          <button
            className={styles.playBtn}
            onClick={e => handlePreview(e, sample.id)}
            title="Prévisualiser"
            aria-label={`Écouter ${sample.name}`}
          >
            ▶
          </button>
        </div>
      ))}
    </div>
  );
}
