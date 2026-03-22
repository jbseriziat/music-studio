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
  const [isDragOver, setIsDragOver] = useState(false);
  const triggerPad = usePadsStore((s) => s.triggerPad);
  const assignPadSample = usePadsStore((s) => s.assignPadSample);

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

  /** Accepter les drops de samples depuis le SampleBrowser. */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json')) as {
        type: string;
        sampleId?: number;
        sampleName?: string;
      };
      if (data.type === 'sample' && typeof data.sampleId === 'number') {
        assignPadSample(id, data.sampleId, data.sampleName ?? `Sample ${data.sampleId}`);
      }
    } catch {
      // Données drag invalides — ignorer silencieusement
    }
  }, [id, assignPadSample]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // TODO: ouvrir une modale de réassignation (prompt 1.7+)
    console.log('[SoundPad] context menu — pad', id);
  }, [id]);

  return (
    <button
      className={`${styles.pad} ${isTriggered ? styles.triggered : ''} ${isDragOver ? styles.dragOver : ''}`}
      style={{ '--pad-color': color, '--text-color': textColor } as React.CSSProperties}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      draggable={sampleId !== null}
      title={sampleName || 'Glisser un son ici'}
      aria-label={`Pad ${id + 1}: ${sampleName || 'vide'}`}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.name}>{sampleName || '—'}</span>
    </button>
  );
}
