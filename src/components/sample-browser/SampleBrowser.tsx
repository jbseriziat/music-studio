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

  useEffect(() => {
    async function load() {
      try {
        const result = await listSamples(category);
        setSamples(result);
      } catch (e) {
        console.error('[SampleBrowser] load error', e);
      }
    }
    load();
  }, [category]);

  return (
    <aside className={`${styles.browser} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>🎵 Sons</span>
        <button className={styles.toggleBtn} onClick={onToggle} title="Réduire">
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      {!collapsed && (
        <>
          <CategoryFilter active={category} onChange={setCategory} />
          <SampleList samples={samples} />
        </>
      )}
    </aside>
  );
}
