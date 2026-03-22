import { useSettingsStore } from '../../stores/settingsStore';
import { LEVEL_CONFIGS } from '../../types/levels';
import { TransportBar } from '../transport/TransportBar';
import styles from './Header.module.css';

export function Header() {
  const { profiles, activeProfileId } = useSettingsStore();
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const levelConfig = LEVEL_CONFIGS.find((c) => c.level === activeProfile?.level);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <span className={styles.logo}>🎵</span>
        <span className={styles.appName}>Music Studio</span>
      </div>

      <div className={styles.center}>
        <TransportBar />
      </div>

      <div className={styles.right}>
        {activeProfile ? (
          <div className={styles.profile}>
            <span className={styles.profileAvatar}>{activeProfile.avatar}</span>
            <div>
              <div className={styles.profileName}>{activeProfile.name}</div>
              <div className={styles.profileLevel}>
                {levelConfig?.icon} {levelConfig?.label}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.profile}>
            <span className={styles.profileAvatar}>👤</span>
            <span className={styles.profileName}>Aucun profil</span>
          </div>
        )}
      </div>
    </header>
  );
}
