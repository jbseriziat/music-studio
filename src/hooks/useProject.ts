import { useCallback } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { newProject, saveProject, loadProject } from '../utils/tauri-commands';

/**
 * Hook de gestion du projet courant.
 * Synchronise le store Zustand avec les commandes Rust.
 */
export function useProject() {
  const store = useProjectStore();

  const createNew = useCallback(async (name: string) => {
    const info = await newProject(name);
    const now = new Date().toISOString();
    store.setProject({
      version: '1.0',
      name: info.name,
      createdBy: '',
      bpm: 120,
      timeSignature: [4, 4],
      sampleRate: 48000,
      tracks: [],
      master: { volume: 1.0, effects: [] },
      createdAt: now,
      updatedAt: now,
    });
    return info;
  }, [store]);

  const save = useCallback(async (path: string) => {
    if (!store.currentProject) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await saveProject(path, store.currentProject as any);
    store.markSaved();
  }, [store]);

  const load = useCallback(async (path: string) => {
    const data = await loadProject(path);
    store.setProject(data as unknown as Parameters<typeof store.setProject>[0]);
  }, [store]);

  return {
    ...store,
    createNew,
    save,
    load,
  };
}
