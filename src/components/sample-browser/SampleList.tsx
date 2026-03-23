import React, { useCallback } from 'react';
import type { SampleInfo } from '../../utils/tauri-commands';
import { SamplePreview } from './SamplePreview';
import styles from './SampleList.module.css';

interface Props {
  samples: SampleInfo[];
  isLoading?: boolean;
}

function formatDuration(ms: number): string {
  const s = ms / 1000;
  return s < 1 ? `${ms}ms` : `${s.toFixed(1)}s`;
}

/** Mini waveform en SVG (26 barres représentant les 128 points de crête). */
function MiniWaveform({ data }: { data: number[] }) {
  if (!data || data.length === 0) return null;

  const W = 52;
  const H = 18;
  const barCount = 26;
  const barW = W / barCount;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={styles.waveform}
      fill="currentColor"
      aria-hidden="true"
    >
      {Array.from({ length: barCount }, (_, i) => {
        // Downsample : max peak sur la plage correspondante
        const start = Math.floor((i / barCount) * data.length);
        const end = Math.floor(((i + 1) / barCount) * data.length);
        let peak = 0;
        for (let j = start; j < end; j++) {
          peak = Math.max(peak, data[j] ?? 0);
        }
        const barH = Math.max(2, peak * (H - 2));
        return (
          <rect
            key={i}
            x={i * barW}
            y={(H - barH) / 2}
            width={Math.max(1, barW - 1)}
            height={barH}
            rx={1}
          />
        );
      })}
    </svg>
  );
}

export function SampleList({ samples, isLoading = false }: Props) {
  const handleDragStart = useCallback((e: React.DragEvent, sample: SampleInfo) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'sample',
        sampleId: sample.id,
        sampleName: sample.name,
        samplePath: sample.path,
        durationMs: sample.duration_ms,
        waveform: sample.waveform,
      })
    );
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  if (isLoading) {
    return <div className={styles.empty}>Chargement…</div>;
  }

  if (samples.length === 0) {
    return <div className={styles.empty}>Aucun son dans cette catégorie.</div>;
  }

  return (
    <div className={styles.list}>
      {samples.map(sample => (
        <div
          key={sample.id}
          className={styles.item}
          draggable
          onDragStart={e => handleDragStart(e, sample)}
          title={`Glisser pour assigner — ${sample.name}`}
        >
          <div className={styles.itemMain}>
            <span className={styles.name}>{sample.name}</span>
            <span className={styles.duration}>{formatDuration(sample.duration_ms)}</span>
          </div>
          {sample.waveform && sample.waveform.length > 0 && (
            <MiniWaveform data={sample.waveform} />
          )}
          <SamplePreview sampleId={sample.id} sampleName={sample.name} />
        </div>
      ))}
    </div>
  );
}
