import React, { useState, useCallback } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { usePadsStore } from '../../stores/padsStore';
import { SamplePickerDialog } from './SamplePickerDialog';
import styles from './SoundPad.module.css';

interface Props {
  id: number;
  color: string;
  textColor?: string;
  /** Emoji affiché au centre du pad. */
  icon: string;
  sampleName: string;
  sampleId: number | null;
  /** Durée du sample assigné (ms). Null si inconnu. */
  durationMs?: number | null;
  /** Données de forme d'onde pré-calculées (128 points normalisés). */
  waveform?: number[];
}

export function SoundPad({ id, color, textColor = '#fff', icon, sampleName, sampleId, durationMs = null, waveform = [] }: Props) {
  const [isTriggered, setIsTriggered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerPad = usePadsStore((s) => s.triggerPad);
  const assignPadSample = usePadsStore((s) => s.assignPadSample);

  const handleClick = useCallback(async () => {
    if (sampleId === null) return;
    triggerPad(id);
    // Animation pulse : scale 0.95 → 1.05 → 1.0 sur 150ms
    setIsTriggered(true);
    setTimeout(() => setIsTriggered(false), 200);
  }, [id, sampleId, triggerPad]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (sampleId === null) return;
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'pad',
        sampleId,
        sampleName,
        // Inclure durée et waveform pour un clip correct sur la timeline
        durationMs: durationMs ?? undefined,
        waveform: waveform.length > 0 ? waveform : undefined,
      })
    );
    e.dataTransfer.effectAllowed = 'copy';
  }, [sampleId, sampleName, durationMs, waveform]);

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
        durationMs?: number;
        waveform?: number[];
      };
      if (data.type === 'sample' && typeof data.sampleId === 'number') {
        assignPadSample(id, data.sampleId, data.sampleName ?? `Sample ${data.sampleId}`, data.durationMs, data.waveform);
      }
    } catch {
      // Données drag invalides — ignorer silencieusement
    }
  }, [id, assignPadSample]);

  /** Clic droit → ouvrir le menu contextuel. */
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  }, []);

  return (
    <div
      className={`${styles.padWrapper} ${isDragOver ? styles.dragOver : ''}`}
      onContextMenu={handleContextMenu}
    >
      {/* Pad principal */}
      <button
        className={`${styles.pad} ${isTriggered ? styles.triggered : ''}`}
        style={{ '--pad-color': color, '--text-color': textColor } as React.CSSProperties}
        onClick={handleClick}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        draggable={sampleId !== null}
        title={sampleName || 'Glisser un son ici'}
        aria-label={`Pad ${id + 1}: ${sampleName || 'vide'}`}
      >
        <span className={styles.icon}>{icon}</span>
        <span className={styles.name}>{sampleName || '—'}</span>
      </button>

      {/* Menu contextuel via Radix DropdownMenu */}
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger asChild>
          {/* Bouton discret en haut à droite du pad */}
          <button
            className={styles.optionsBtn}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
            aria-label={`Options du pad ${id + 1}`}
            tabIndex={-1}
          >
            ⋮
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menuContent} sideOffset={4} align="end">
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={() => setPickerOpen(true)}
            >
              🎵 Changer le son
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={() => { if (sampleId !== null) triggerPad(id); }}
              disabled={sampleId === null}
            >
              🔊 Jouer
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Dialogue de sélection de son */}
      <SamplePickerDialog
        padId={id}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(newSampleId, newSampleName, newDurationMs, newWaveform) =>
          assignPadSample(id, newSampleId, newSampleName, newDurationMs, newWaveform)
        }
      />
    </div>
  );
}
