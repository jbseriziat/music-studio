import { useEffect, useRef, useState } from 'react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../../stores/projectStore';
import { useTracksStore } from '../../stores/tracksStore';
import { importAudioFile, addClipCmd } from '../../utils/tauri-commands';
import { useFeatureLevel } from '../../hooks/useFeatureLevel';
import { ProjectBrowser } from './ProjectBrowser';
import { ExportDialog } from './ExportDialog';
import styles from './ProjectMenu.module.css';

let importClipCounter = 800000;

export function ProjectMenu() {
  const { projectName, isDirty, isProjectOpen, saveCurrentProject, closeProject } = useProjectStore();
  const { currentLevel } = useFeatureLevel();
  const [showBrowser, setShowBrowser] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const menuRef = useRef<HTMLDivElement>(null);

  // Ctrl+S → sauvegarder
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProjectOpen]);

  // Fermer le menu au clic extérieur
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  async function handleSave() {
    if (!isProjectOpen) return;
    setSaveStatus('saving');
    try {
      await saveCurrentProject();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch (e) {
      console.error('[ProjectMenu] save error', e);
      setSaveStatus('idle');
    }
  }

  /** Importe un fichier audio via le sélecteur de fichiers et l'ajoute à la timeline. */
  async function handleImportAudio() {
    setShowMenu(false);
    try {
      const result = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac'] }],
      });
      if (!result) return; // annulé par l'utilisateur

      const sourcePath = typeof result === 'string' ? result : (result as { path: string }).path;
      const sampleInfo = await importAudioFile(sourcePath);

      // Ajouter le sample sur la première piste audio disponible.
      const { tracks, addClip: storeAddClip } = useTracksStore.getState();
      const targetTrack = tracks.find((t) => t.type === 'audio');
      if (targetTrack) {
        const trackIdx = tracks.indexOf(targetTrack);
        const newClipId = `import-${++importClipCounter}`;
        const durationSecs = sampleInfo.duration_ms / 1000;
        storeAddClip({
          id: newClipId,
          trackId: targetTrack.id,
          sampleId: String(sampleInfo.id),
          sampleName: sampleInfo.name,
          position: 0,
          duration: durationSecs,
          color: targetTrack.color,
          waveformData: sampleInfo.waveform,
          type: 'audio',
        });
        await addClipCmd(importClipCounter, sampleInfo.id, 0, durationSecs, trackIdx);
      }
    } catch (e) {
      console.error('[ProjectMenu] import error', e);
    }
  }

  const statusIcon =
    saveStatus === 'saving' ? '⏳' :
    saveStatus === 'saved' ? '✅' :
    isDirty ? '●' : '💾';

  return (
    <>
      {showBrowser && (
        <ProjectBrowser onClose={() => setShowBrowser(false)} />
      )}
      {showExport && (
        <ExportDialog onClose={() => setShowExport(false)} />
      )}

      <div className={styles.wrapper} ref={menuRef}>
        {/* Nom du projet + indicateur dirty */}
        <button
          className={styles.nameBtn}
          onClick={() => isProjectOpen ? setShowMenu((v) => !v) : setShowBrowser(true)}
          title={isProjectOpen ? 'Options du projet' : 'Ouvrir ou créer un projet'}
        >
          <span className={`${styles.statusIcon} ${isDirty ? styles.dirty : ''}`}>
            {statusIcon}
          </span>
          <span className={styles.name}>
            {projectName ?? 'Aucun projet'}
          </span>
          {isProjectOpen && <span className={styles.chevron}>▾</span>}
        </button>

        {/* Menu déroulant */}
        {showMenu && isProjectOpen && (
          <div className={styles.menu}>
            <button className={styles.menuItem} onClick={() => { handleSave(); setShowMenu(false); }}>
              💾 Sauvegarder <kbd>Ctrl+S</kbd>
            </button>
            <button className={styles.menuItem} onClick={() => { setShowBrowser(true); setShowMenu(false); }}>
              📂 Ouvrir un projet
            </button>
            <button className={styles.menuItem} onClick={() => { setShowBrowser(true); setShowMenu(false); }}>
              ➕ Nouveau projet
            </button>

            {/* Niveau 4+ : import et export audio */}
            {currentLevel >= 4 && (
              <>
                <div className={styles.separator} />
                <button className={styles.menuItem} onClick={handleImportAudio}>
                  📥 Importer un audio…
                </button>
                <button className={styles.menuItem} onClick={() => { setShowExport(true); setShowMenu(false); }}>
                  🎧 Exporter en WAV…
                </button>
              </>
            )}

            <div className={styles.separator} />
            <button
              className={`${styles.menuItem} ${styles.danger}`}
              onClick={() => { closeProject(); setShowMenu(false); setShowBrowser(true); }}
            >
              ✖ Fermer le projet
            </button>
          </div>
        )}
      </div>
    </>
  );
}
