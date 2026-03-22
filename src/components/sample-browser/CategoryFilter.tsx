
import { LevelGate } from '../shared/LevelGate';
import styles from './CategoryFilter.module.css';

export const CATEGORIES = [
  { id: 'drums',       label: 'Drums',       emoji: '🥁' },
  { id: 'instruments', label: 'Instruments', emoji: '🎸' },
  { id: 'melodies',    label: 'Mélodies',    emoji: '🎵' },
  { id: 'fun',         label: 'Fun',         emoji: '🐱' },
  { id: 'favorites',   label: 'Favoris',     emoji: '⭐' },
] as const;

interface Props {
  active: string;
  onChange: (cat: string) => void;
}

export function CategoryFilter({ active, onChange }: Props) {
  return (
    <div className={styles.list}>
      {CATEGORIES.map(cat => (
        <button
          key={cat.id}
          className={`${styles.btn} ${active === cat.id ? styles.active : ''}`}
          onClick={() => onChange(cat.id)}
        >
          <span className={styles.emoji}>{cat.emoji}</span>
          <span className={styles.label}>{cat.label}</span>
        </button>
      ))}
      {/* Recherche visible à partir du niveau 2 */}
      <LevelGate level={2}>
        <div className={styles.search}>
          <input type="text" placeholder="Rechercher…" className={styles.searchInput} />
        </div>
      </LevelGate>
    </div>
  );
}
