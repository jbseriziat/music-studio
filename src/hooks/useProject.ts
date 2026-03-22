import { useProjectStore } from '../stores/projectStore';

/**
 * Hook de gestion du projet courant.
 * Expose les actions du projectStore directement.
 */
export function useProject() {
  return useProjectStore();
}
