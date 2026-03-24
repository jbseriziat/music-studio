import { useEffect } from 'react';
import { useTransportStore } from '../stores/transportStore';
import { useTracksStore } from '../stores/tracksStore';
import { useProjectStore } from '../stores/projectStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePianoRollStore } from '../stores/pianoRollStore';
import { deleteClipCmd, setTrackMuteCmd, setTrackSoloCmd } from '../utils/tauri-commands';

/**
 * Hook global de raccourcis clavier (monté une seule fois dans App.tsx).
 *
 * Raccourcis disponibles :
 *   Espace          — Play / Stop
 *   R               — Record toggle (niveau 4+)
 *   M               — Mute la piste sélectionnée
 *   S               — Solo la piste sélectionnée
 *   Ctrl+Z          — Undo
 *   Ctrl+Y / Ctrl+Shift+Z — Redo
 *   Ctrl+S          — Sauvegarder
 *   Ctrl+Shift+S    — Ouvrir le navigateur de projets
 *   Ctrl+D          — Dupliquer le clip sélectionné
 *   Ctrl+C          — Copier le clip / les notes sélectionné(e)s
 *   Ctrl+V          — Coller
 *   Ctrl+A          — Sélectionner tout (notes dans le piano roll)
 *   Delete/Backspace — Supprimer la sélection
 *   + / =           — Zoom avant sur la timeline
 *   -               — Zoom arrière sur la timeline
 *
 * Inactif si l'utilisateur tape dans un <input> / <textarea> / <select>.
 * Les raccourcis M, S, R, Ctrl+A, Ctrl+C, Ctrl+V sont redirectés vers
 * le piano roll quand celui-ci est ouvert.
 */
export function useKeyboardShortcuts() {
  // On utilise getState() dans le handler pour éviter les closures périmées
  // et pour ne pas avoir à lister chaque sélecteur dans les dépendances.
  // Le useEffect se réabonne uniquement une fois.
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      // ── Ignorer si l'utilisateur tape dans un champ de texte ──────────────
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.tagName === 'SELECT'
      ) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const pianoRollOpen = usePianoRollStore.getState().isOpen;

      // ── Espace : Play / Stop ──────────────────────────────────────────────
      if (e.code === 'Space' && !ctrl && !e.shiftKey) {
        e.preventDefault();
        const t = useTransportStore.getState();
        if (t.isPlaying || t.isRecording) t.stop();
        else t.play();
        return;
      }

      // ── Ctrl+Z : Undo ─────────────────────────────────────────────────────
      if (e.key === 'z' && ctrl && !e.shiftKey) {
        e.preventDefault();
        if (!pianoRollOpen) {
          useTracksStore.getState().undo();
        }
        return;
      }

      // ── Ctrl+Y / Ctrl+Shift+Z : Redo ─────────────────────────────────────
      if ((e.key === 'y' && ctrl && !e.shiftKey) || (e.key === 'z' && ctrl && e.shiftKey)) {
        e.preventDefault();
        if (!pianoRollOpen) {
          useTracksStore.getState().redo();
        }
        return;
      }

      // ── Ctrl+S : Sauvegarder ──────────────────────────────────────────────
      if (e.key === 's' && ctrl && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.getState().saveCurrentProject().catch(() => {});
        return;
      }

      // ── Ctrl+Shift+S : Ouvrir le navigateur de projets ───────────────────
      if (e.key === 's' && ctrl && e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('project:openBrowser'));
        return;
      }

      // ── Ctrl+D : Dupliquer le clip sélectionné ────────────────────────────
      if (e.key === 'd' && ctrl && !pianoRollOpen) {
        e.preventDefault();
        const { selectedClipId, duplicateClip } = useTracksStore.getState();
        if (selectedClipId) duplicateClip(selectedClipId);
        return;
      }

      // ── Ctrl+C : Copier ───────────────────────────────────────────────────
      if (e.key === 'c' && ctrl) {
        e.preventDefault();
        if (pianoRollOpen) {
          usePianoRollStore.getState().copySelectedNotes();
        } else {
          const { selectedClipId, copyClip } = useTracksStore.getState();
          if (selectedClipId) copyClip(selectedClipId);
        }
        return;
      }

      // ── Ctrl+V : Coller ───────────────────────────────────────────────────
      if (e.key === 'v' && ctrl) {
        e.preventDefault();
        if (pianoRollOpen) {
          usePianoRollStore.getState().pasteNotes();
        } else {
          useTracksStore.getState().pasteClip();
        }
        return;
      }

      // ── Ctrl+A : Sélectionner tout ────────────────────────────────────────
      if (e.key === 'a' && ctrl) {
        e.preventDefault();
        if (pianoRollOpen) {
          usePianoRollStore.getState().selectAll();
        }
        // Dans la timeline on ne sélectionne pas tous les clips (pas de multi-sélection)
        return;
      }

      // ── Delete / Backspace : Supprimer la sélection ───────────────────────
      if ((e.code === 'Delete' || e.code === 'Backspace') && !ctrl) {
        if (pianoRollOpen) {
          e.preventDefault();
          usePianoRollStore.getState().deleteSelectedNotes();
        } else {
          const { selectedClipId, removeClip, selectClip } = useTracksStore.getState();
          if (selectedClipId) {
            e.preventDefault();
            // Synchroniser la suppression avec le moteur audio.
            const match = selectedClipId.match(/\d+/);
            if (match) {
              deleteClipCmd(Number(match[0])).catch(() => {});
            }
            removeClip(selectedClipId);
            selectClip(null);
          }
        }
        return;
      }

      // ── R : Toggle Record (niveau 4+) ─────────────────────────────────────
      if (e.key === 'r' && !ctrl && !e.shiftKey && !pianoRollOpen) {
        const { currentLevel } = useSettingsStore.getState();
        if (currentLevel >= 4) {
          e.preventDefault();
          const t = useTransportStore.getState();
          if (t.isRecording) {
            const projectName = useProjectStore.getState().projectName ?? 'recording';
            t.stopRecording(projectName).catch(() => {});
          } else {
            t.startRecording().catch(() => {});
          }
        }
        return;
      }

      // ── M : Mute la piste sélectionnée ───────────────────────────────────
      if (e.key === 'm' && !ctrl && !pianoRollOpen) {
        const { selectedTrackId, tracks, updateTrack } = useTracksStore.getState();
        if (selectedTrackId) {
          const track = tracks.find((t) => t.id === selectedTrackId);
          if (track) {
            e.preventDefault();
            const trackIdx = tracks.indexOf(track);
            const newMuted = !track.muted;
            updateTrack(selectedTrackId, { muted: newMuted });
            setTrackMuteCmd(trackIdx, newMuted).catch(() => {});
          }
        }
        return;
      }

      // ── S : Solo la piste sélectionnée ───────────────────────────────────
      if (e.key === 's' && !ctrl && !pianoRollOpen) {
        const { selectedTrackId, tracks, updateTrack } = useTracksStore.getState();
        if (selectedTrackId) {
          const track = tracks.find((t) => t.id === selectedTrackId);
          if (track) {
            e.preventDefault();
            const trackIdx = tracks.indexOf(track);
            const newSolo = !track.solo;
            updateTrack(selectedTrackId, { solo: newSolo });
            setTrackSoloCmd(trackIdx, newSolo).catch(() => {});
          }
        }
        return;
      }

      // ── + / = : Zoom avant sur la timeline ───────────────────────────────
      if ((e.key === '+' || e.key === '=') && !ctrl) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('timeline:zoom', { detail: { direction: 'in' } }));
        return;
      }

      // ── - : Zoom arrière sur la timeline ─────────────────────────────────
      if (e.key === '-' && !ctrl) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('timeline:zoom', { detail: { direction: 'out' } }));
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // Aucune dépendance : utilise getState() pour éviter les closures périmées.
}
