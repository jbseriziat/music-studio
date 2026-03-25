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
import { SynthPanel } from './components/synth/SynthPanel';
import { PianoRoll } from './components/piano-roll/PianoRoll';
import { Timeline } from './components/timeline/Timeline';
import { Mixer } from './components/mixer/Mixer';
import { MasteringPanel } from './components/mastering/MasteringPanel';
import styles from './App.module.css';

type InstrumentTab = 'pads' | 'drums' | 'synth';
type MainView = 'timeline' | 'mixer';

function App() {
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);
  const isProjectOpen = useProjectStore((s) => s.isProjectOpen);
  const { position } = useTransport();
  const { isVisible } = useFeatureLevel();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<InstrumentTab>('pads');
  const [mainView, setMainView] = useState<MainView>('timeline');

  // Raccourcis clavier globaux (Espace, Suppr, Ctrl+Z, Ctrl+S)
  useKeyboardShortcuts();

  return (
    <>
      {/* Piano Roll (overlay modal, niveau 3+) */}
      <PianoRoll />

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
            {/* Onglets : Pads | Drum Rack (Niveau 2+) | Synthé (Niveau 3+) */}
            {isVisible(2) && (
              <div className={styles.tabBar}>
                <button
                  className={`${styles.tab} ${activeTab === 'pads' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('pads')}
                >
                  🎵 Pads
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'drums' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('drums')}
                >
                  🥁 Drum Rack
                </button>
                {isVisible(3) && (
                  <button
                    className={`${styles.tab} ${activeTab === 'synth' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('synth')}
                  >
                    🎹 Synthé
                  </button>
                )}
              </div>
            )}

            {/* Contenu selon l'onglet actif */}
            {activeTab === 'pads' && <SoundPadGrid />}
            {activeTab === 'drums' && isVisible(2) && <DrumRack />}
            {activeTab === 'synth' && isVisible(3) && <SynthPanel />}
          </section>

          <section className={styles.timelineSection}>
            {/* Toggle Timeline / Mixer (niveau 4+) */}
            {isVisible(4) && (
              <div className={styles.viewToggle}>
                <button
                  className={`${styles.viewBtn} ${mainView === 'timeline' ? styles.viewBtnActive : ''}`}
                  onClick={() => setMainView('timeline')}
                  title="Timeline"
                >
                  📋 Timeline
                </button>
                <button
                  className={`${styles.viewBtn} ${mainView === 'mixer' ? styles.viewBtnActive : ''}`}
                  onClick={() => setMainView('mixer')}
                  title="Mixer"
                >
                  🎚️ Mixer
                </button>
              </div>
            )}

            {mainView === 'timeline' && (
              <Timeline
                positionSecs={position}
                onDrumTrackDoubleClick={() => setActiveTab('drums')}
              />
            )}
            {mainView === 'mixer' && isVisible(4) && <Mixer />}
            {mainView === 'mixer' && isVisible(5) && <MasteringPanel />}
          </section>
        </div>
      </AppShell>
    </>
  );
}

export default App;
