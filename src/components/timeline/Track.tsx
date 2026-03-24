import React, { useCallback, useRef, useState } from 'react';
import { Clip } from './Clip';
import { DrumClip } from './DrumClip';
import { MidiClip } from './MidiClip';
import { addClipCmd, moveClipCmd, setTrackMuteCmd, setTrackSoloCmd } from '../../utils/tauri-commands';
import { useTracksStore } from '../../stores/tracksStore';
import styles from './Track.module.css';


const SNAP_GRID = 0.5; // secondes

interface TrackClip {
  id: string;
  sampleId: string;
  sampleName?: string;
  position: number;
  duration: number;
  color: string;
  waveformData: number[];
  type?: 'audio' | 'midi';
  midiClipId?: number;
}

interface Props {
  id: string;
  /** Index numérique 0-based de la piste — transmis au moteur audio pour mute/solo. */
  trackIndex: number;
  name: string;
  color: string;
  muted: boolean;
  solo: boolean;
  /** Piste armée pour l'enregistrement (visible niveau 4+). */
  armed?: boolean;
  /** Type de la piste : "audio" | "drum_rack" | "instrument". */
  trackType?: string;
  clips: TrackClip[];
  pixelsPerSec: number;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onDeleteTrack: (id: string) => void;
  /** Callback quand l'utilisateur double-clique sur le header (pour ouvrir le drum rack). */
  onDoubleClickHeader?: () => void;
  /** Callback pour ajouter un clip MIDI à cette piste instrument. */
  onAddMidiClip?: () => void;
  /** Callback quand l'utilisateur double-clique sur un clip MIDI (pour ouvrir le piano roll). */
  onMidiClipDoubleClick?: (midiClipId: number) => void;
  /** Callback pour armer/désarmer la piste (niveau 4+, uniquement pistes audio). */
  onArmToggle?: () => void;
}

function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

let clipIdCounter = 100;

export function Track({
  id, trackIndex, name, color, muted, solo, armed, trackType, clips,
  pixelsPerSec, selectedClipId, onSelectClip, onDeleteTrack,
  onDoubleClickHeader, onAddMidiClip, onMidiClipDoubleClick, onArmToggle,
}: Props) {
  const { addClip, moveClip, updateTrack } = useTracksStore();
  const draggingRef = useRef<{ clipId: string; startX: number; startPos: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Compteur de dragEnter/Leave pour gérer les enfants (qui déclenchent aussi ces événements).
  const dragCountRef = useRef(0);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsDragOver(false);
    // Les pistes DrumRack et Instrument ne reçoivent pas de clips audio par drag.
    if (trackType === 'drum_rack' || trackType === 'instrument') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawPos = (e.clientX - rect.left) / pixelsPerSec;
    const position = Math.max(0, snapToGrid(rawPos, SNAP_GRID));

    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw) as {
        type: string;
        sampleId: number;
        sampleName: string;
        durationMs?: number;
        waveform?: number[];
      };

      const durationSecs = data.durationMs ? data.durationMs / 1000 : 1.0;
      const newId = `clip-${++clipIdCounter}`;

      addClip({
        id: newId,
        trackId: id,
        sampleId: String(data.sampleId),
        sampleName: data.sampleName,
        position,
        duration: durationSecs,
        color,
        waveformData: data.waveform ?? [],
      });

      await addClipCmd(clipIdCounter, data.sampleId, position, durationSecs, trackIndex);
    } catch (err) {
      console.error('[Track] drop error', err);
    }
  }, [id, trackIndex, pixelsPerSec, color, trackType, addClip]);

  const handleMute = useCallback(() => {
    const newMuted = !muted;
    updateTrack(id, { muted: newMuted });
    setTrackMuteCmd(trackIndex, newMuted).catch(
      (e) => console.error('[Track] setMute error', e),
    );
  }, [id, trackIndex, muted, updateTrack]);

  const handleSolo = useCallback(() => {
    const newSolo = !solo;
    updateTrack(id, { solo: newSolo });
    setTrackSoloCmd(trackIndex, newSolo).catch(
      (e) => console.error('[Track] setSolo error', e),
    );
  }, [id, trackIndex, solo, updateTrack]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCountRef.current -= 1;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleClipMoveStart = useCallback((clipId: string, startX: number, startPos: number) => {
    draggingRef.current = { clipId, startX, startPos };

    const onMouseUp = async (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = (e.clientX - draggingRef.current.startX) / pixelsPerSec;
      const newPos = Math.max(0, snapToGrid(draggingRef.current.startPos + delta, SNAP_GRID));
      const { clipId: cId } = draggingRef.current;
      draggingRef.current = null;
      document.removeEventListener('mouseup', onMouseUp);

      // Mettre à jour le store frontend.
      moveClip(cId, id, newPos);

      // Synchroniser le déplacement avec le moteur audio.
      const match = cId.match(/\d+/);
      if (match) {
        try {
          await moveClipCmd(Number(match[0]), newPos);
        } catch {
          // Le clip peut ne pas exister dans le moteur audio, ignorer.
        }
      }
    };

    document.addEventListener('mouseup', onMouseUp);
  }, [id, pixelsPerSec, moveClip]);

  // ── Rendu de la zone de piste selon le type ──────────────────────────────

  const renderLaneContent = () => {
    if (trackType === 'drum_rack') {
      return (
        <DrumClip
          pixelsPerSec={pixelsPerSec}
          color={color}
          onDoubleClick={onDoubleClickHeader}
        />
      );
    }

    if (trackType === 'instrument') {
      const midiClips = clips.filter(c => c.type === 'midi' && c.midiClipId !== undefined);
      return (
        <>
          {midiClips.map(clip => (
            <div
              key={clip.id}
              style={{ position: 'absolute', left: clip.position * pixelsPerSec }}
            >
              <MidiClip
                midiClipId={clip.midiClipId!}
                width={clip.duration * pixelsPerSec}
                color={color}
                onDoubleClick={() => onMidiClipDoubleClick?.(clip.midiClipId!)}
              />
            </div>
          ))}
        </>
      );
    }

    // Clips audio (piste audio standard).
    return (
      <>
        {clips.map(clip => (
          <Clip
            key={clip.id}
            id={clip.id}
            sampleName={clip.sampleName ?? clip.sampleId}
            color={clip.color}
            positionSecs={clip.position}
            durationSecs={clip.duration}
            pixelsPerSec={pixelsPerSec}
            selected={selectedClipId === clip.id}
            waveformData={clip.waveformData}
            onSelect={onSelectClip}
            onMoveStart={handleClipMoveStart}
          />
        ))}
      </>
    );
  };

  return (
    <div className={`${styles.track} ${muted ? styles.muted : ''}`}>
      <div
        className={styles.header}
        style={{ borderLeftColor: color }}
        onDoubleClick={onDoubleClickHeader}
        title={onDoubleClickHeader ? 'Double-clic pour éditer' : undefined}
      >
        <span className={styles.name}>{name}</span>

        {/* Bouton "+" pour ajouter un clip MIDI (piste instrument uniquement) */}
        {trackType === 'instrument' && onAddMidiClip && (
          <button
            className={styles.addMidiBtn}
            onClick={(e) => { e.stopPropagation(); onAddMidiClip(); }}
            title="Ajouter un clip MIDI"
            aria-label="Ajouter un clip MIDI"
          >
            +
          </button>
        )}

        {/* ─── Bouton Arm (enregistrement) — niveau 4+, pistes audio ─── */}
        {onArmToggle && trackType !== 'drum_rack' && trackType !== 'instrument' && (
          <button
            className={`${styles.armBtn} ${armed ? styles.active : ''}`}
            onClick={(e) => { e.stopPropagation(); onArmToggle(); }}
            title={armed ? 'Désarmer la piste' : 'Armer pour l\'enregistrement'}
            aria-label="Arm"
            aria-pressed={armed}
          >
            ●
          </button>
        )}

        {/* ─── Boutons Mute / Solo ──────────────────────────────────── */}
        <button
          className={`${styles.muteBtn} ${muted ? styles.active : ''}`}
          onClick={handleMute}
          title={muted ? 'Activer la piste' : 'Couper la piste'}
          aria-label="Mute"
          aria-pressed={muted}
        >
          M
        </button>
        <button
          className={`${styles.soloBtn} ${solo ? styles.active : ''}`}
          onClick={handleSolo}
          title={solo ? 'Désactiver le solo' : 'Mettre en solo'}
          aria-label="Solo"
          aria-pressed={solo}
        >
          S
        </button>

        <button
          className={styles.deleteBtn}
          onClick={() => onDeleteTrack(id)}
          title="Supprimer la piste"
          aria-label="Supprimer"
        >
          🗑️
        </button>
      </div>
      <div
        className={`${styles.lane} ${
          isDragOver && trackType !== 'drum_rack' && trackType !== 'instrument'
            ? styles.dragOver : ''
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        {renderLaneContent()}
      </div>
    </div>
  );
}
