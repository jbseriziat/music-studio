import React, { useState, useCallback } from 'react';
import { triggerPad } from '../../utils/tauri-commands';
import styles from './SoundPad.module.css';

interface Props {
  id: number;
  color: string;
  emoji: string;
  sampleName: string;
  sampleId: number | null;
  onDragStart?: (sampleId: number, sampleName: string) => void;
  onAssignRequest?: (padId: number) => void;
}

export function SoundPad({ id, color, emoji, sampleName, sampleId, onDragStart, onAssignRequest }: Props) {
  const [isTriggered, setIsTriggered] = useState(false);

  const handleClick = useCallback(async () => {
    if (sampleId === null) return;
    try {
      await triggerPad(id);
    } catch (e) {
      console.error('[SoundPad] trigger error', e);
    }
    setIsTriggered(true);
    setTimeout(() => setIsTriggered(false), 300);
  }, [id, sampleId]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (sampleId === null) return;
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ type: 'pad', sampleId, sampleName })
    );
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(sampleId, sampleName);
  }, [sampleId, sampleName, onDragStart]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onAssignRequest?.(id);
  }, [id, onAssignRequest]);

  return (
    <button
      className={`${styles.pad} ${isTriggered ? styles.triggered : ''}`}
      style={{ '--pad-color': color } as React.CSSProperties}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      draggable={sampleId !== null}
      title={sampleName || 'Pas de son'}
      aria-label={`Pad ${id + 1}: ${sampleName}`}
    >
      <span className={styles.emoji}>{emoji}</span>
      <span className={styles.name}>{sampleName || '—'}</span>
    </button>
  );
}
