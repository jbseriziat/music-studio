import React, { useCallback } from 'react';
import styles from './Clip.module.css';

interface Props {
  id: string;
  sampleName: string;
  color: string;
  positionSecs: number;
  durationSecs: number;
  pixelsPerSec: number;
  selected: boolean;
  waveformData: number[];
  onSelect: (id: string) => void;
  onMoveStart: (id: string, startX: number, startPositionSecs: number) => void;
}

/** Mini waveform SVG (128 points normalisés). */
function WaveformSvg({ data, width, height }: { data: number[]; width: number; height: number }) {
  if (!data || data.length === 0) return null;
  const step = width / data.length;
  const mid = height / 2;
  const points = data
    .map((v, i) => {
      const x = i * step;
      const amp = v * mid * 0.9;
      return `${x},${mid - amp} ${x},${mid + amp}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      className={styles.waveform}
      aria-hidden
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

export function Clip({
  id, sampleName, color, positionSecs, durationSecs, pixelsPerSec,
  selected, waveformData, onSelect, onMoveStart,
}: Props) {
  const width = Math.max(durationSecs * pixelsPerSec, 20);
  const left = positionSecs * pixelsPerSec;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(id);
    onMoveStart(id, e.clientX, positionSecs);
  }, [id, positionSecs, onSelect, onMoveStart]);

  return (
    <div
      className={`${styles.clip} ${selected ? styles.selected : ''}`}
      style={{ left, width, background: color }}
      onMouseDown={handleMouseDown}
      title={sampleName}
    >
      <span className={styles.name}>{sampleName}</span>
      <WaveformSvg data={waveformData} width={width - 4} height={26} />
    </div>
  );
}
