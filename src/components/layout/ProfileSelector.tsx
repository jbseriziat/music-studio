import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { LEVEL_CONFIGS } from '../../types/levels';
import { ProfileCreator } from './ProfileCreator';
import styles from './ProfileSelector.module.css';

interface Props {
  /** Si true, s'affiche en plein écran (au démarrage). Si false, s'affiche en overlay gérable. */
  fullscreen?: boolean;
  onClose?: () => void;
}

export function ProfileSelector({ fullscreen = true, onClose }: Props) {
  const { profiles, switchProfile } = useSettingsStore();
  const [showCreator, setShowCreator] = useState(false);

  const handleSelect = (id: string) => {
    switchProfile(id);
    onClose?.();
  };

  return (
    <div className={`${styles.screen} ${fullscreen ? styles.fullscreen : ''}`}>
      <div className={styles.inner}>
        <div className={styles.titleBlock}>
          <span className={styles.titleEmoji}>🎵</span>
          <h1 className={styles.title}>Qui joue aujourd'hui ?</h1>
          <p className={styles.subtitle}>Choisis ton profil pour commencer</p>
        </div>

        <div className={styles.grid}>
          {profiles.map(profile => {
            const cfg = LEVEL_CONFIGS.find(c => c.level === profile.level);
            return (
              <button
                key={profile.id}
                className={styles.card}
                style={{ '--level-color': cfg?.color } as React.CSSProperties}
                onClick={() => handleSelect(profile.id)}
              >
                <span className={styles.avatar}>{profile.avatar}</span>
                <span className={styles.name}>{profile.name}</span>
                <span className={styles.levelBadge} style={{ background: cfg?.color }}>
                  {cfg?.icon} {cfg?.label}
                </span>
              </button>
            );
          })}

          {/* Bouton "+" */}
          <button
            className={`${styles.card} ${styles.addCard}`}
            onClick={() => setShowCreator(true)}
          >
            <span className={styles.addIcon}>+</span>
            <span className={styles.name}>Nouveau profil</span>
          </button>
        </div>

        {onClose && (
          <button className={styles.closeBtn} onClick={onClose}>✕ Fermer</button>
        )}
      </div>

      {showCreator && (
        <ProfileCreator onClose={() => setShowCreator(false)} />
      )}
    </div>
  );
}
