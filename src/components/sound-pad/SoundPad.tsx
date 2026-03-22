import React, { useState, useCallback } from 'react';
import { usePadsStore } from '../../stores/padsStore';
import styles from './SoundPad.module.css';

interface Props {
  id: number;
  color: string;
  textColor?: string;
  /** Emoji affiché au centre du pad. */
  icon: string;
  sampleName: string;
  sampleId: number | null;
}

export function SoundPad({ id, color, textColor = '#fff', icon, sampleName, sampleId }: Props) {
  const [isTriggered, setIsTriggered] = useState(false);
  const triggerPad = usePadsStore((s) => s.triggerPad);

  const handleClick = useCallback(async () => {
    if (sampleId === null) return;
    // Lancer l'IPC (fire-and-forget, l'animation est indépendante)
    triggerPad(id);
    // Animation pulse : scale 0.95 → 1.05 → 1.0 sur 150ms
    setIsTriggered(true);
    setTimeout(() => setIsTriggered(false), 200);
  }, [id, sampleId, triggerPad]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (sampleId === null) return;
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ type: 'pad', sampleId, sampleName })
    );
    e.dataTransfer.effectAllowed = 'copy';
  }, [sampleId, sampleName]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // TODO: ouvrir le Sample Browser pour réassigner (prompt 1.5)
    console.log('menu contextuel pad', id);
  }, [id]);

  return (
    <button
      className={`${styles.pad} ${isTriggered ? styles.triggered : ''}`}
      style={{ '--pad-color': color, '--text-color': textColor } as React.CSSProperties}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      draggable={sampleId !== null}
      title={sampleName || 'Pas de son'}
      aria-label={`Pad ${id + 1}: ${sampleName}`}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.name}>{sampleName || '—'}</span>
    </button>
  );
}
