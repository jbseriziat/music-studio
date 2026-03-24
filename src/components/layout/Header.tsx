import { useState } from 'react';
import { TransportBar } from '../transport/TransportBar';
import { ProfileSwitcher } from './ProfileSwitcher';
import { ProjectMenu } from './ProjectMenu';
import { SettingsDialog } from '../settings/SettingsDialog';
import styles from './Header.module.css';

export function Header() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.left}>
          <ProjectMenu />
        </div>

        <div className={styles.center}>
          <TransportBar />
        </div>

        <div className={styles.right}>
          {/* Bouton paramètres */}
          <button
            className={styles.settingsBtn}
            onClick={() => setShowSettings(true)}
            title="Paramètres audio"
            aria-label="Ouvrir les paramètres"
          >
            ⚙️
          </button>
          <ProfileSwitcher />
        </div>
      </header>

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
