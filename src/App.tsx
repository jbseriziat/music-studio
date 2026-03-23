import { useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useProjectStore } from './stores/projectStore';
import { useTransport } from './hooks/useTransport';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFeatureLevel } from './hooks/useFeatureLevel';
import { AppShell } from './components/layout/AppShell';
import { ProfileSelector } from './components/layout/ProfileSelector';
import { ProjectBrowser } from './components/layout/ProjectBrowser';
import { SampleBrowser } from './components/sample-browser/SampleBrowser';
import { SoundPadGrid } from './components/sound-pad/SoundPadGrid';
import { DrumRack } from './components/drum-rack/DrumRack';
import { Timeline } from './components/timeline/Timeline';
import styles from './App.module.css';

type InstrumentTab = 'pads' | 'drums';

function App() {
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);
  const isProjectOpen = useProjectStore((s) => s.isProjectOpen);
  const { position } = useTransport();
  const { isVisible } = useFeatureLevel();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<InstrumentTab>('pads');

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
            {/* Onglets : Pads | Drum Rack (Niveau 2+) */}
            {isVisible(2) && (
              <div className={styles.tabBar}>
                <button
                  className={`${styles.tab} ${activeTab === 'pads' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('pads')}
                >
                  🎹 Pads
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'drums' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('drums')}
                >
                  🥁 Drum Rack
                </button>
              </div>
            )}

            {/* Contenu selon l'onglet actif */}
            {activeTab === 'pads' && <SoundPadGrid />}
            {activeTab === 'drums' && isVisible(2) && <DrumRack />}
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
