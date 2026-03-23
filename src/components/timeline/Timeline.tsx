import { useCallback, useEffect, useRef, useState } from 'react';
import { Track } from './Track';
import { TimeRuler } from './TimeRuler';
import { Playhead } from './Playhead';
import { AddTrackButton } from './AddTrackButton';
import { useTracksStore } from '../../stores/tracksStore';
import { useFeatureLevel } from '../../hooks/useFeatureLevel';
import { deleteClipCmd } from '../../utils/tauri-commands';
import styles from './Timeline.module.css';

const PIXELS_PER_SEC = 100;
const TOTAL_SECS = 60; // 60s visible max au niveau 1
const MAX_TRACKS_LEVEL1 = 4;

interface Props {
  positionSecs: number;
}

let trackIdCounter = 0;
const TRACK_COLORS = ['#FF5722', '#2196F3', '#4CAF50', '#9C27B0', '#FF9800', '#00BCD4'];

export function Timeline({ positionSecs }: Props) {
  const { tracks, clips, selectedClipId, addTrack, removeTrack, selectClip } = useTracksStore();
  const { currentLevel } = useFeatureLevel();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tracksHeight, setTracksHeight] = useState(0);
  const tracksAreaRef = useRef<HTMLDivElement>(null);

  // Mesurer la hauteur de la zone pistes pour le playhead.
  useEffect(() => {
    const el = tracksAreaRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setTracksHeight(el.offsetHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Auto-scroll pour suivre le playhead.
  useEffect(() => {
    if (!scrollRef.current) return;
    const playheadX = positionSecs * PIXELS_PER_SEC;
    const container = scrollRef.current;
    const margin = 100;
    if (playheadX > container.scrollLeft + container.clientWidth - margin) {
      container.scrollLeft = playheadX - container.clientWidth / 2;
    }
  }, [positionSecs]);

  // Touche Suppr pour effacer le clip sélectionné (frontend + moteur audio).
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        // Synchroniser la suppression avec le moteur audio.
        // Le clip ID frontend est "clip-<number>" → extraire la partie numérique.
        const match = selectedClipId.match(/\d+/);
        if (match) {
          try {
            await deleteClipCmd(Number(match[0]));
          } catch {
            // Le clip peut ne pas être dans le moteur (pas encore joué), ignorer.
          }
        }
        useTracksStore.getState().removeClip(selectedClipId);
        selectClip(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedClipId, selectClip]);

  const handleAddTrack = useCallback(() => {
    const n = tracks.length;
    const color = TRACK_COLORS[n % TRACK_COLORS.length];
    addTrack(`Piste ${++trackIdCounter}`, 'audio', color);
  }, [tracks.length, addTrack]);

  const maxTracks = currentLevel >= 2 ? Infinity : MAX_TRACKS_LEVEL1;
  const canAddTrack = tracks.length < maxTracks;

  return (
    <div className={styles.container}>
      {/* Zone scrollable (règle + pistes + playhead) */}
      <div className={styles.scrollArea} ref={scrollRef}>
        <div className={styles.content} style={{ width: TOTAL_SECS * PIXELS_PER_SEC + 130 }}>
          {/* Espace vide à gauche pour aligner la règle avec les pistes */}
          <div className={styles.rulerRow}>
            <div className={styles.headerSpacer} />
            <div className={styles.rulerWrap}>
              <TimeRuler
                totalSecs={TOTAL_SECS}
                pixelsPerSec={PIXELS_PER_SEC}
                scrollLeft={scrollRef.current?.scrollLeft ?? 0}
              />
            </div>
          </div>

          {/* Pistes */}
          <div className={styles.tracksArea} ref={tracksAreaRef}>
            {/* Playhead */}
            <div className={styles.playheadWrapper} style={{ left: 130 }}>
              <Playhead
                positionSecs={positionSecs}
                pixelsPerSec={PIXELS_PER_SEC}
                height={tracksHeight}
              />
            </div>

            {tracks.map(track => (
              <Track
                key={track.id}
                id={track.id}
                name={track.name}
                color={track.color}
                clips={clips
                  .filter(c => c.trackId === track.id)
                  .map(c => ({
                    id: c.id,
                    sampleId: c.sampleId,
                    sampleName: c.sampleName,
                    position: c.position,
                    duration: c.duration,
                    color: c.color,
                    waveformData: c.waveformData,
                  }))}
                pixelsPerSec={PIXELS_PER_SEC}
                selectedClipId={selectedClipId}
                onSelectClip={selectClip}
                onDeleteTrack={removeTrack}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bouton d'ajout de piste (en dehors du scroll) */}
      <AddTrackButton onClick={handleAddTrack} disabled={!canAddTrack} />
      {!canAddTrack && (
        <p className={styles.limitMsg}>
          Maximum {MAX_TRACKS_LEVEL1} pistes au niveau 1
        </p>
      )}
    </div>
  );
}
