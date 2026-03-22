import { useState, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { listProjects, deleteProjectFile, type ProjectSummary } from '../../utils/tauri-commands';
import styles from './ProjectBrowser.module.css';

interface Props {
  onClose?: () => void;
}

export function ProjectBrowser({ onClose }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createNew, openProject } = useProjectStore();

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const list = await listProjects();
      setProjects(list);
    } catch (e) {
      console.warn('[ProjectBrowser] listProjects error', e);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      await createNew(name);
      onClose?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(path: string) {
    setLoading(true);
    setError(null);
    try {
      await openProject(path);
      onClose?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(path: string, name: string) {
    if (!confirm(`Supprimer le projet "${name}" ?`)) return;
    try {
      await deleteProjectFile(path);
      await loadProjects();
    } catch (e) {
      setError(String(e));
    }
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <h1 className={styles.title}>🎵 Music Studio</h1>
        <p className={styles.subtitle}>Choisis un projet ou crée-en un nouveau</p>

        {/* Création de projet */}
        <div className={styles.createSection}>
          {creating ? (
            <div className={styles.createForm}>
              <input
                className={styles.nameInput}
                type="text"
                placeholder="Nom du projet…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <button
                className={styles.btnCreate}
                onClick={handleCreate}
                disabled={!newName.trim() || loading}
              >
                {loading ? '…' : '✅ Créer'}
              </button>
              <button
                className={styles.btnCancel}
                onClick={() => { setCreating(false); setNewName(''); }}
              >
                Annuler
              </button>
            </div>
          ) : (
            <button className={styles.btnNew} onClick={() => setCreating(true)}>
              ➕ Nouveau projet
            </button>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {/* Liste des projets existants */}
        {projects.length > 0 ? (
          <div className={styles.grid}>
            {projects.map((p) => (
              <div key={p.path} className={styles.card}>
                <button
                  className={styles.cardMain}
                  onClick={() => handleOpen(p.path)}
                  disabled={loading}
                >
                  <span className={styles.cardIcon}>🎵</span>
                  <span className={styles.cardName}>{p.name}</span>
                  <span className={styles.cardDate}>{formatDate(p.modified_at)}</span>
                  <span className={styles.cardBpm}>{p.bpm} BPM</span>
                </button>
                <button
                  className={styles.cardDelete}
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.path, p.name); }}
                  title="Supprimer"
                  aria-label={`Supprimer ${p.name}`}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        ) : (
          !creating && (
            <p className={styles.empty}>Pas encore de projet. Crée le tien ! ☝️</p>
          )
        )}
      </div>
    </div>
  );
}
