import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { LEVEL_CONFIGS } from '../../types/levels';
import { ProfileCreator } from './ProfileCreator';
import styles from './ProfileSelector.module.css';

export function ProfileSelector() {
  const { profiles, activeProfileId, switchProfile } = useSettingsStore();
  const [showCreator, setShowCreator] = useState(false);

  // Masquer si un profil est déjà actif
  if (activeProfileId !== null) return null;

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <h1 className={styles.title}>🎵 Music Studio</h1>
        <p className={styles.subtitle}>Choisis ton profil</p>

        <div className={styles.grid}>
          {profiles.map(profile => {
            const cfg = LEVEL_CONFIGS.find(c => c.level === profile.level);
            return (
              <button
                key={profile.id}
                className={styles.card}
                onClick={() => switchProfile(profile.id)}
              >
                <span className={styles.avatar}>{profile.avatar}</span>
                <span className={styles.name}>{profile.name}</span>
                <span className={styles.level} style={{ color: cfg?.color }}>
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
      </div>

      {showCreator && <ProfileCreator onClose={() => setShowCreator(false)} />}
    </div>
  );
}
