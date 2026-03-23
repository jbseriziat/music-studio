import { useState, useRef, useCallback } from 'react';
import styles from './BpmControl.module.css';

interface Props {
  bpm: number;
  onChange: (bpm: number) => void;
}

function bpmEmoji(bpm: number): string {
  if (bpm < 80) return '🐢';
  if (bpm < 120) return '🚶';
  if (bpm < 160) return '🏃';
  return '🚀';
}

function clampBpm(v: number): number {
  return Math.max(40, Math.min(240, Math.round(v)));
}

export function BpmControl({ bpm, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const dragStartY = useRef<number | null>(null);
  const dragStartBpm = useRef<number>(bpm);

  // ─── Drag vertical sur la valeur numérique ───────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editing) return;
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartBpm.current = bpm;

      const onMouseMove = (me: MouseEvent) => {
        if (dragStartY.current === null) return;
        // Drag vers le haut = augmenter ; vers le bas = diminuer
        const delta = dragStartY.current - me.clientY;
        onChange(clampBpm(dragStartBpm.current + delta));
      };

      const onMouseUp = () => {
        dragStartY.current = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [bpm, onChange, editing],
  );

  // ─── Double-clic → champ de saisie directe ───────────────────────────────
  const handleDoubleClick = useCallback(() => {
    setEditValue(String(bpm));
    setEditing(true);
  }, [bpm]);

  const commitEdit = useCallback(() => {
    const v = parseInt(editValue, 10);
    if (!isNaN(v)) onChange(clampBpm(v));
    setEditing(false);
  }, [editValue, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') setEditing(false);
    },
    [commitEdit],
  );

  return (
    <div className={styles.control}>
      <span className={styles.emoji}>{bpmEmoji(bpm)}</span>

      <button
        className={styles.btn}
        onClick={() => onChange(clampBpm(bpm - 1))}
        title="BPM −1"
      >
        −
      </button>

      {editing ? (
        <input
          className={styles.valueInput}
          value={editValue}
          autoFocus
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span
          className={`${styles.value} ${styles.valueDrag}`}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          title="Glisser ↑↓ ou double-cliquer pour éditer"
        >
          {bpm}
        </span>
      )}

      <button
        className={styles.btn}
        onClick={() => onChange(clampBpm(bpm + 1))}
        title="BPM +1"
      >
        +
      </button>

      <span className={styles.label}>BPM</span>
    </div>
  );
}
