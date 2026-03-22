import { useEffect, useState, useCallback } from 'react';
import { SoundPad } from './SoundPad';
import { getPadConfig, listSamples } from '../../utils/tauri-commands';
import type { SampleInfo } from '../../utils/tauri-commands';
import styles from './SoundPadGrid.module.css';

// Palette de 16 couleurs Material Design 400
const PAD_COLORS = [
  '#EF5350', '#FF7043', '#FFCA28', '#66BB6A',
  '#42A5F5', '#AB47BC', '#EC407A', '#26C6DA',
  '#FFA726', '#8BC34A', '#7E57C2', '#26A69A',
  '#5C6BC0', '#FF5722', '#78909C', '#F06292',
];

// Emojis par défaut pour les 16 pads
const PAD_EMOJIS = [
  '🥁', '🥁', '🥁', '🥁',
  '🎸', '🎸', '🎸', '🎸',
  '🎹', '🎹', '🎹', '🎹',
  '🐱', '🎵', '🔔', '⭐',
];

interface PadState {
  sampleId: number | null;
  sampleName: string;
}

export function SoundPadGrid() {
  const [pads, setPads] = useState<PadState[]>(
    Array.from({ length: 16 }, () => ({ sampleId: null, sampleName: '—' }))
  );

  useEffect(() => {
    async function loadPads() {
      try {
        const [config, samples] = await Promise.all([getPadConfig(), listSamples()]);
        const sampleMap = new Map<number, SampleInfo>(samples.map(s => [s.id, s]));
        setPads(
          config.map(sampleId => ({
            sampleId,
            sampleName: sampleId !== null ? (sampleMap.get(sampleId)?.name ?? '—') : '—',
          }))
        );
      } catch (e) {
        console.error('[SoundPadGrid] loadPads error', e);
      }
    }
    loadPads();
  }, []);

  const handleAssignRequest = useCallback((_padId: number) => {
    // TODO: ouvrir le SampleBrowser pour réassigner
    // Pour l'instant, log
    console.log('[SoundPadGrid] assign request for pad', _padId);
  }, []);

  return (
    <div className={styles.grid}>
      {pads.map((pad, i) => (
        <SoundPad
          key={i}
          id={i}
          color={PAD_COLORS[i]}
          emoji={PAD_EMOJIS[i]}
          sampleName={pad.sampleName}
          sampleId={pad.sampleId}
          onAssignRequest={handleAssignRequest}
        />
      ))}
    </div>
  );
}
