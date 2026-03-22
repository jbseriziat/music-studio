import { useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useTransport } from './hooks/useTransport';
import { AppShell } from './components/layout/AppShell';
import { ProfileSelector } from './components/layout/ProfileSelector';
import { SampleBrowser } from './components/sample-browser/SampleBrowser';
import { SoundPadGrid } from './components/sound-pad/SoundPadGrid';
import { Timeline } from './components/timeline/Timeline';
import styles from './App.module.css';

function App() {
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);
  const { position } = useTransport();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <>
      {/* Écran de sélection de profil si aucun profil actif */}
      {!activeProfileId && <ProfileSelector fullscreen />}

      <AppShell
        sidebar={
          <SampleBrowser
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
          />
        }
      >
        <div className={styles.mainLayout}>
          <section className={styles.padsSection}>
            <SoundPadGrid />
          </section>
          <section className={styles.timelineSection}>
            <Timeline positionSecs={position} />
          </section>
        </div>
      </AppShell>
    </>
  );
}

export default App;
