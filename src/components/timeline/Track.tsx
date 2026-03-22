import React, { useCallback, useRef } from 'react';
import { Clip } from './Clip';
import { addClipCmd } from '../../utils/tauri-commands';
import { useTracksStore } from '../../stores/tracksStore';
import styles from './Track.module.css';

const SNAP_GRID = 0.5; // secondes

interface TrackClip {
  id: string;
  sampleId: string;
  sampleName?: string;
  position: number;
  duration: number;
  color: string;
  waveformData: number[];
}

interface Props {
  id: string;
  name: string;
  color: string;
  clips: TrackClip[];
  pixelsPerSec: number;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onDeleteTrack: (id: string) => void;
}

function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

let clipIdCounter = 100;

export function Track({ id, name, color, clips, pixelsPerSec, selectedClipId, onSelectClip, onDeleteTrack }: Props) {
  const { addClip, moveClip } = useTracksStore();
  const draggingRef = useRef<{ clipId: string; startX: number; startPos: number } | null>(null);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const rawPos = (e.clientX - rect.left) / pixelsPerSec;
    const position = Math.max(0, snapToGrid(rawPos, SNAP_GRID));

    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw) as {
        type: string;
        sampleId: number;
        sampleName: string;
        durationMs?: number;
        waveform?: number[];
      };

      const durationSecs = data.durationMs ? data.durationMs / 1000 : 1.0;
      const newId = `clip-${++clipIdCounter}`;

      addClip({
        id: newId,
        trackId: id,
        sampleId: String(data.sampleId),
        sampleName: data.sampleName,
        position,
        duration: durationSecs,
        color,
        waveformData: data.waveform ?? [],
      });

      await addClipCmd(clipIdCounter, data.sampleId, position, durationSecs);
    } catch (err) {
      console.error('[Track] drop error', err);
    }
  }, [id, pixelsPerSec, color, addClip]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleClipMoveStart = useCallback((clipId: string, startX: number, startPos: number) => {
    draggingRef.current = { clipId, startX, startPos };

    const onMouseUp = async (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = (e.clientX - draggingRef.current.startX) / pixelsPerSec;
      const newPos = Math.max(0, snapToGrid(draggingRef.current.startPos + delta, SNAP_GRID));
      const { clipId } = draggingRef.current;
      draggingRef.current = null;
      document.removeEventListener('mouseup', onMouseUp);
      moveClip(clipId, id, newPos);
    };

    document.addEventListener('mouseup', onMouseUp);
  }, [id, pixelsPerSec, moveClip]);

  return (
    <div className={styles.track}>
      <div className={styles.header} style={{ borderLeftColor: color }}>
        <span className={styles.name}>{name}</span>
        <button
          className={styles.deleteBtn}
          onClick={() => onDeleteTrack(id)}
          title="Supprimer la piste"
          aria-label="Supprimer"
        >
          🗑️
        </button>
      </div>
      <div
        className={styles.lane}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {clips.map(clip => (
          <Clip
            key={clip.id}
            id={clip.id}
            sampleName={clip.sampleName ?? clip.sampleId}
            color={clip.color}
            positionSecs={clip.position}
            durationSecs={clip.duration}
            pixelsPerSec={pixelsPerSec}
            selected={selectedClipId === clip.id}
            waveformData={clip.waveformData}
            onSelect={onSelectClip}
            onMoveStart={handleClipMoveStart}
          />
        ))}
      </div>
    </div>
  );
}
