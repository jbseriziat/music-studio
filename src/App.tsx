import { useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useProjectStore } from './stores/projectStore';
import { useTransport } from './hooks/useTransport';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { AppShell } from './components/layout/AppShell';
import { ProfileSelector } from './components/layout/ProfileSelector';
import { ProjectBrowser } from './components/layout/ProjectBrowser';
import { SampleBrowser } from './components/sample-browser/SampleBrowser';
import { SoundPadGrid } from './components/sound-pad/SoundPadGrid';
import { Timeline } from './components/timeline/Timeline';
import styles from './App.module.css';

function App() {
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);
  const isProjectOpen = useProjectStore((s) => s.isProjectOpen);
  const { position } = useTransport();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Raccourcis clavier globaux (Espace, Suppr, Ctrl+Z, Ctrl+S)
  useKeyboardShortcuts();

  return (
    <>
      {/* Écran de sélection de profil si aucun profil actif */}
      {!activeProfileId && <ProfileSelector fullscreen />}

      {/* Navigateur de projets si un profil est actif mais pas de projet ouvert */}
      {activeProfileId && !isProjectOpen && (
        <ProjectBrowser />
      )}

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
