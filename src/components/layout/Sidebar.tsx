import { useState } from 'react';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Sidebar panel */}
      <aside className={`${styles.sidebar} ${expanded ? styles.expanded : styles.collapsed}`}>
        <div className={styles.content}>
          <div className={styles.header}>
            <span className={styles.title}>Sons</span>
          </div>
          <div className={styles.placeholder}>
            <span className={styles.placeholderIcon}>🎹</span>
            <span>Sample Browser</span>
            <span style={{ fontSize: 'var(--font-size-xs)', opacity: 0.6 }}>Phase 1</span>
          </div>
        </div>
      </aside>

      {/* Toggle button — toujours visible, positionné en dehors du panneau */}
      <button
        className={styles.toggleBtn}
        style={{
          position: 'absolute',
          left: expanded ? 'var(--sidebar-width)' : 0,
          top: '8px',
          transition: 'left var(--transition, 180ms ease)',
        }}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Réduire la sidebar' : 'Ouvrir la sidebar'}
        aria-label={expanded ? 'Réduire la sidebar' : 'Ouvrir la sidebar'}
      >
        {expanded ? '‹' : '›'}
      </button>
    </div>
  );
}
