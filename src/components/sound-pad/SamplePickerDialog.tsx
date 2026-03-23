import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { listSamples } from '../../utils/tauri-commands';
import type { SampleInfo } from '../../utils/tauri-commands';
import { CATEGORIES } from '../sample-browser/CategoryFilter';
import styles from './SamplePickerDialog.module.css';

interface Props {
  padId: number;
  open: boolean;
  onClose: () => void;
  onSelect: (sampleId: number, sampleName: string) => void;
}

export function SamplePickerDialog({ padId, open, onClose, onSelect }: Props) {
  const [category, setCategory] = useState('drums');
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    listSamples(category)
      .then(r => { if (!cancelled) setSamples(r); })
      .catch(() => { if (!cancelled) setSamples([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [open, category]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>
            🎵 Choisir un son — Pad {padId + 1}
          </Dialog.Title>

          {/* Catégories */}
          <div className={styles.categories}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`${styles.catBtn} ${category === cat.id ? styles.catActive : ''}`}
                onClick={() => setCategory(cat.id)}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>

          {/* Liste de samples */}
          <div className={styles.sampleList}>
            {isLoading && (
              <div className={styles.loading}>Chargement…</div>
            )}
            {!isLoading && samples.length === 0 && (
              <div className={styles.empty}>Aucun son dans cette catégorie.</div>
            )}
            {!isLoading && samples.map(sample => (
              <button
                key={sample.id}
                className={styles.sampleBtn}
                onClick={() => {
                  onSelect(sample.id, sample.name);
                  onClose();
                }}
              >
                <span className={styles.sampleName}>{sample.name}</span>
                <span className={styles.sampleDuration}>
                  {sample.duration_ms < 1000
                    ? `${sample.duration_ms}ms`
                    : `${(sample.duration_ms / 1000).toFixed(1)}s`}
                </span>
              </button>
            ))}
          </div>

          <Dialog.Close asChild>
            <button className={styles.closeBtn} aria-label="Fermer">✕</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
