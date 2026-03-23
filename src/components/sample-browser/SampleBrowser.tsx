import { useEffect, useState } from 'react';
import { CategoryFilter } from './CategoryFilter';
import { SampleList } from './SampleList';
import { listSamples } from '../../utils/tauri-commands';
import type { SampleInfo } from '../../utils/tauri-commands';
import styles from './SampleBrowser.module.css';

interface Props {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function SampleBrowser({ collapsed = false, onToggle }: Props) {
  const [category, setCategory] = useState('drums');
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const result = await listSamples(category);
        if (!cancelled) setSamples(result);
      } catch (e) {
        console.error('[SampleBrowser] load error', e);
        if (!cancelled) setSamples([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [category]);

  return (
    <aside className={`${styles.browser} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>🎵 Sons</span>
        <button
          className={styles.toggleBtn}
          onClick={onToggle}
          title={collapsed ? 'Ouvrir le navigateur' : 'Réduire le navigateur'}
          aria-label={collapsed ? 'Ouvrir le navigateur de sons' : 'Réduire le navigateur de sons'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      {!collapsed && (
        <>
          <CategoryFilter active={category} onChange={setCategory} />
          <SampleList samples={samples} isLoading={isLoading} />
        </>
      )}
    </aside>
  );
}
