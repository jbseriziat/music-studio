import { useEffect } from 'react';
import { SoundPad } from './SoundPad';
import { getPadConfig, listSamples } from '../../utils/tauri-commands';
import { usePadsStore } from '../../stores/padsStore';
import styles from './SoundPadGrid.module.css';

export function SoundPadGrid() {
  const { pads, setPadName } = usePadsStore();

  // Au montage : récupérer la config réelle des pads depuis le backend
  // et mettre à jour les noms/sampleIds depuis la banque de samples.
  useEffect(() => {
    async function loadPads() {
      try {
        const [config, samples] = await Promise.all([getPadConfig(), listSamples()]);
        const sampleMap = new Map(samples.map((s) => [s.id, s]));
        config.forEach((sampleId, i) => {
          const info = sampleId !== null ? sampleMap.get(sampleId) : null;
          const name = info?.name ?? (sampleId !== null ? `Sample ${sampleId}` : '—');
          setPadName(i, sampleId, name, info?.duration_ms, info?.waveform);
        });
      } catch (e) {
        console.error('[SoundPadGrid] loadPads error', e);
      }
    }
    loadPads();
  // setPadName est stable (Zustand), pas besoin dans les deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.grid}>
      {pads.map((pad) => (
        <SoundPad
          key={pad.id}
          id={pad.id}
          color={pad.color}
          textColor={pad.textColor}
          icon={pad.icon}
          sampleName={pad.sampleName}
          sampleId={pad.sampleId}
          durationMs={pad.durationMs}
          waveform={pad.waveform}
        />
      ))}
    </div>
  );
}
