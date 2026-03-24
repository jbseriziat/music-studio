import { useCallback, useEffect, useRef, useState } from 'react';
import { Track } from './Track';
import { TimeRuler } from './TimeRuler';
import { Playhead } from './Playhead';
import { AddTrackButton } from './AddTrackButton';
import { useTracksStore } from '../../stores/tracksStore';
import { useTransportStore } from '../../stores/transportStore';
import { useFeatureLevel } from '../../hooks/useFeatureLevel';
import { useSynthStore } from '../../stores/synthStore';
import { usePianoRollStore } from '../../stores/pianoRollStore';
import { addMidiClip, armTrackCmd } from '../../utils/tauri-commands';
import type { AutomationParameter } from '../../stores/automationStore';
import type { Clip } from '../../types/audio';
import styles from './Timeline.module.css';

const DEFAULT_PIXELS_PER_SEC = 100;
const MIN_PIXELS_PER_SEC = 20;
const MAX_PIXELS_PER_SEC = 600;
const TOTAL_SECS = 120; // 2 minutes visibles
const MAX_TRACKS_LEVEL1 = 4;

interface Props {
  positionSecs: number;
  /** Appelé quand l'utilisateur double-clique sur la piste Drum Rack. */
  onDrumTrackDoubleClick?: () => void;
}

let trackIdCounter = 0;
const TRACK_COLORS = ['#FF5722', '#2196F3', '#4CAF50', '#9C27B0', '#FF9800', '#00BCD4'];

export function Timeline({ positionSecs, onDrumTrackDoubleClick }: Props) {
  const { tracks, clips, selectedClipId, addTrack, removeTrack, addClip, selectClip } = useTracksStore();
  const { currentLevel } = useFeatureLevel();
  const bpm         = useTransportStore((s) => s.bpm);
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const loopStart   = useTransportStore((s) => s.loopStart);
  const loopEnd     = useTransportStore((s) => s.loopEnd);
  const setLoop     = useTransportStore((s) => s.setLoop);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const [tracksHeight, setTracksHeight] = useState(0);
  const [pixelsPerSec, setPixelsPerSec] = useState(DEFAULT_PIXELS_PER_SEC);
  /** Index de la piste armée pour l'enregistrement (-1 = aucune). Niveau 4+. */
  const [armedTrackIdx, setArmedTrackIdx] = useState<number>(-1);
  /**
   * Paramètre d'automation visible par piste.
   * null = lane cachée, 'volume'|'pan' = lane visible avec ce paramètre.
   */
  const [automationVisible, setAutomationVisible] = useState<Record<string, AutomationParameter | null>>({});

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
    const playheadX = positionSecs * pixelsPerSec;
    const container = scrollRef.current;
    const margin = 100;
    if (playheadX > container.scrollLeft + container.clientWidth - margin) {
      container.scrollLeft = playheadX - container.clientWidth / 2;
    }
  }, [positionSecs, pixelsPerSec]);

  // Zoom horizontal : Ctrl + molette.
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    setPixelsPerSec((prev) =>
      Math.max(MIN_PIXELS_PER_SEC, Math.min(MAX_PIXELS_PER_SEC, prev * factor)),
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Auto-ajout de la piste Drum Rack au niveau 2+.
  const hasDrumTrack = tracks.some((t) => t.type === 'drum_rack');
  useEffect(() => {
    if (currentLevel >= 2 && !hasDrumTrack) {
      addTrack('Drum Rack', 'drum_rack', '#FF9800');
    }
  }, [currentLevel, hasDrumTrack, addTrack]);

  // Auto-ajout de la piste Instrument (Synthé) au niveau 3+.
  const hasInstrumentTrack = tracks.some((t) => t.type === 'instrument');
  useEffect(() => {
    if (currentLevel >= 3 && !hasInstrumentTrack) {
      addTrack('Synthé', 'instrument', '#9C27B0');
      // Initialiser le moteur synthé dès que la piste est créée.
      useSynthStore.getState().init().catch(console.error);
    }
  }, [currentLevel, hasInstrumentTrack, addTrack]);

  // Zoom via les touches +/- (événement CustomEvent émis par useKeyboardShortcuts).
  useEffect(() => {
    const handler = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: 'in' | 'out' }>).detail.direction;
      const factor = dir === 'in' ? 1.25 : 0.8;
      setPixelsPerSec((prev) =>
        Math.max(MIN_PIXELS_PER_SEC, Math.min(MAX_PIXELS_PER_SEC, prev * factor)),
      );
    };
    window.addEventListener('timeline:zoom', handler);
    return () => window.removeEventListener('timeline:zoom', handler);
  }, []);

  const handleAddTrack = useCallback(() => {
    const n = tracks.length;
    const color = TRACK_COLORS[n % TRACK_COLORS.length];
    addTrack(`Piste ${++trackIdCounter}`, 'audio', color);
  }, [tracks.length, addTrack]);

  /**
   * Arme/désarme une piste pour l'enregistrement (niveau 4+).
   * Une seule piste armée à la fois.
   */
  const handleArmToggle = useCallback(async (idx: number) => {
    const isNowArmed = armedTrackIdx !== idx;
    // Désarmer l'ancienne piste si différente.
    if (armedTrackIdx >= 0 && armedTrackIdx !== idx) {
      armTrackCmd(armedTrackIdx, false).catch(console.error);
    }
    // Armer/désarmer la nouvelle.
    armTrackCmd(idx, isNowArmed).catch(console.error);
    setArmedTrackIdx(isNowArmed ? idx : -1);
  }, [armedTrackIdx]);

  /** Affiche/masque la lane d'automation d'une piste. */
  const handleToggleAutomation = useCallback((trackId: string) => {
    setAutomationVisible((prev) => ({
      ...prev,
      [trackId]: prev[trackId] != null ? null : 'volume',
    }));
  }, []);

  // ── Gestion des clips MIDI ─────────────────────────────────────────────────

  /** Crée un nouveau clip MIDI vide (4 beats à la position 0) sur la piste instrument. */
  const handleAddMidiClip = useCallback(async (frontendTrackId: string, trackColor: string) => {
    let rustTrackId = useSynthStore.getState().trackId;
    if (rustTrackId === null) {
      await useSynthStore.getState().init();
      rustTrackId = useSynthStore.getState().trackId;
    }
    if (rustTrackId === null) return;

    try {
      const defaultLengthBeats = 4;
      const rustClipId = await addMidiClip(rustTrackId, 0, defaultLengthBeats);
      const durationSecs = defaultLengthBeats * (60 / bpm);

      const newClip: Clip = {
        id: `midi-clip-${rustClipId}`,
        trackId: frontendTrackId,
        sampleId: '',
        position: 0,
        duration: durationSecs,
        color: trackColor,
        waveformData: [],
        type: 'midi',
        midiClipId: rustClipId,
        startBeats: 0,
        lengthBeats: defaultLengthBeats,
      };

      addClip(newClip);

      // Ouvrir le piano roll pour ce nouveau clip.
      usePianoRollStore.getState().openForClip(rustTrackId, rustClipId);
    } catch (err) {
      console.error('[Timeline] handleAddMidiClip error:', err);
    }
  }, [bpm, addClip]);

  /** Ouvre le piano roll pour un clip MIDI existant (double-clic). */
  const handleMidiClipDoubleClick = useCallback((midiClipId: number) => {
    const rustTrackId = useSynthStore.getState().trackId;
    if (rustTrackId === null) return;
    usePianoRollStore.getState().openForClip(rustTrackId, midiClipId);
  }, []);

  const maxTracks = currentLevel >= 2 ? Infinity : MAX_TRACKS_LEVEL1;
  const canAddTrack = tracks.length < maxTracks;
  const contentWidth = TOTAL_SECS * pixelsPerSec + 130;

  return (
    <div className={styles.container}>
      {/* Zone scrollable (règle + pistes + playhead) */}
      <div className={styles.scrollArea} ref={scrollRef}>
        <div className={styles.content} style={{ width: contentWidth }}>
          {/* Règle temporelle — secondes (niveau 1) ou mesures/temps (niveau 2+) */}
          <div className={styles.rulerRow}>
            <div className={styles.headerSpacer} />
            <div className={styles.rulerWrap}>
              <TimeRuler
                totalSecs={TOTAL_SECS}
                pixelsPerSec={pixelsPerSec}
                bpm={bpm}
                scrollLeft={scrollRef.current?.scrollLeft ?? 0}
                loopEnabled={loopEnabled}
                loopStart={loopStart}
                loopEnd={loopEnd}
                onLoopChange={(s, e) => setLoop(loopEnabled, s, e)}
              />
            </div>
          </div>

          {/* Pistes */}
          <div className={styles.tracksArea} ref={tracksAreaRef}>
            {/* Playhead */}
            <div className={styles.playheadWrapper} style={{ left: 130 }}>
              <Playhead
                positionSecs={positionSecs}
                pixelsPerSec={pixelsPerSec}
                height={tracksHeight}
              />
            </div>

            {tracks.map((track, idx) => (
              <Track
                key={track.id}
                id={track.id}
                trackIndex={idx}
                name={track.name}
                color={track.color}
                muted={track.muted}
                solo={track.solo}
                armed={armedTrackIdx === idx}
                clips={clips
                  .filter((c) => c.trackId === track.id)
                  .map((c) => ({
                    id: c.id,
                    sampleId: c.sampleId,
                    sampleName: c.sampleName,
                    position: c.position,
                    duration: c.duration,
                    color: c.color,
                    waveformData: c.waveformData,
                    type: c.type,
                    midiClipId: c.midiClipId,
                  }))}
                trackType={track.type}
                pixelsPerSec={pixelsPerSec}
                selectedClipId={selectedClipId}
                onSelectClip={selectClip}
                onDeleteTrack={removeTrack}
                onDoubleClickHeader={
                  track.type === 'drum_rack' ? onDrumTrackDoubleClick : undefined
                }
                onAddMidiClip={
                  track.type === 'instrument'
                    ? () => handleAddMidiClip(track.id, track.color)
                    : undefined
                }
                onMidiClipDoubleClick={
                  track.type === 'instrument' ? handleMidiClipDoubleClick : undefined
                }
                onArmToggle={
                  currentLevel >= 4 && track.type === 'audio'
                    ? () => handleArmToggle(idx)
                    : undefined
                }
                automationParameter={
                  currentLevel >= 4 ? (automationVisible[track.id] ?? null) : null
                }
                onToggleAutomation={
                  currentLevel >= 4
                    ? () => handleToggleAutomation(track.id)
                    : undefined
                }
                onChangeAutomationParam={
                  currentLevel >= 4
                    ? (p) => setAutomationVisible((prev) => ({ ...prev, [track.id]: p }))
                    : undefined
                }
                totalSecs={TOTAL_SECS}
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
