import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { ProjectBrowser } from './ProjectBrowser';
import styles from './ProjectMenu.module.css';

export function ProjectMenu() {
  const { projectName, isDirty, isProjectOpen, saveCurrentProject, closeProject } = useProjectStore();
  const [showBrowser, setShowBrowser] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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

  const statusIcon =
    saveStatus === 'saving' ? '⏳' :
    saveStatus === 'saved' ? '✅' :
    isDirty ? '●' : '💾';

  return (
    <>
      {showBrowser && (
        <ProjectBrowser onClose={() => setShowBrowser(false)} />
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
