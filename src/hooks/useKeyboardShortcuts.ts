import { useEffect } from 'react';
import { useTransportStore } from '../stores/transportStore';
import { useTracksStore } from '../stores/tracksStore';
import { useProjectStore } from '../stores/projectStore';

/**
 * Hook global de raccourcis clavier.
 * - Espace : Play / Stop
 * - Suppr / Backspace : Supprimer le clip sélectionné
 * - Ctrl+Z / Cmd+Z : Annuler la dernière action
 * - Ctrl+S / Cmd+S : Sauvegarder le projet
 *
 * Inactif si l'utilisateur est en train de taper dans un <input> / <textarea>.
 */
export function useKeyboardShortcuts() {
  const transport = useTransportStore();
  const tracks = useTracksStore();
  const project = useProjectStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignorer si l'utilisateur tape dans un champ de texte.
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Espace → Play / Stop
      if (e.code === 'Space' && !ctrl) {
        e.preventDefault();
        if (transport.isPlaying) transport.stop();
        else transport.play();
        return;
      }

      // Suppr / Backspace → Supprimer clip sélectionné
      if ((e.code === 'Delete' || e.code === 'Backspace') && !ctrl) {
        if (tracks.selectedClipId) {
          e.preventDefault();
          tracks.removeClip(tracks.selectedClipId);
        }
        return;
      }

      // Ctrl+Z → Annuler
      if (e.key === 'z' && ctrl && !e.shiftKey) {
        e.preventDefault();
        tracks.undo();
        return;
      }

      // Ctrl+S → Sauvegarder
      if (e.key === 's' && ctrl) {
        e.preventDefault();
        project.saveCurrentProject().catch(() => {});
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    transport.isPlaying,
    transport.play,
    transport.stop,
    tracks.selectedClipId,
    tracks.removeClip,
    tracks.undo,
    project.saveCurrentProject,
  ]);
}
