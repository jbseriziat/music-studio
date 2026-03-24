import { useCallback } from 'react';
import type { Track } from '../../types/audio';
import { useMixerStore, LINEAR_TO_DB, DB_TO_LINEAR } from '../../stores/mixerStore';
import { Knob } from '../shared/Knob';
import { Fader } from '../shared/Fader';
import { VuMeter } from './VuMeter';
import { EffectRack } from '../effects/EffectRack';
import { setTrackVolumeDb, setTrackPanCmd, setTrackMuteCmd, setTrackSoloCmd } from '../../utils/tauri-commands';
import styles from './ChannelStrip.module.css';

interface ChannelStripProps {
  track: Track;
  /** Identifiant numérique de la piste (0-based pour audio/drum, ≥100 pour synth). */
  trackIndex: number;
  onMuteToggle: (muted: boolean) => void;
  onSoloToggle: (solo: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
}

const TYPE_ICON: Record<Track['type'], string> = {
  audio: '🎵',
  drum_rack: '🥁',
  instrument: '🎹',
};

export function ChannelStrip({
  track,
  trackIndex,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onPanChange,
}: ChannelStripProps) {
  const meter = useMixerStore((s) => s.meters[String(trackIndex)]);
  const ZERO_METER = { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };

  const volumeDb = LINEAR_TO_DB(track.volume);

  const handleVolumeChange = useCallback(
    (db: number) => {
      const linear = DB_TO_LINEAR(db);
      onVolumeChange(linear);
      setTrackVolumeDb(trackIndex, db).catch(console.error);
    },
    [trackIndex, onVolumeChange]
  );

  const handlePanChange = useCallback(
    (pan: number) => {
      onPanChange(pan);
      setTrackPanCmd(trackIndex, pan).catch(console.error);
    },
    [trackIndex, onPanChange]
  );

  const handleMute = useCallback(() => {
    const next = !track.muted;
    onMuteToggle(next);
    setTrackMuteCmd(trackIndex, next).catch(console.error);
  }, [track.muted, trackIndex, onMuteToggle]);

  const handleSolo = useCallback(() => {
    const next = !track.solo;
    onSoloToggle(next);
    setTrackSoloCmd(trackIndex, next).catch(console.error);
  }, [track.solo, trackIndex, onSoloToggle]);

  return (
    <div
      className={styles.strip}
      style={{ borderTopColor: track.color }}
      aria-label={`Piste ${track.name}`}
    >
      {/* Nom et icône type */}
      <div className={styles.header}>
        <span className={styles.typeIcon}>{TYPE_ICON[track.type]}</span>
        <span className={styles.name} title={track.name}>
          {track.name}
        </span>
      </div>

      {/* Chaîne d'effets (phase 4.2) */}
      <div className={styles.effectsArea}>
        <EffectRack trackId={String(trackIndex)} />
      </div>

      {/* Panoramique */}
      <div className={styles.panRow}>
        <Knob
          value={track.pan}
          min={-1}
          max={1}
          label="Pan"
          defaultValue={0}
          size={36}
          decimals={2}
          onChange={handlePanChange}
        />
      </div>

      {/* Mute / Solo */}
      <div className={styles.mutesoloRow}>
        <button
          className={`${styles.msBtn} ${track.muted ? styles.muted : ''}`}
          onClick={handleMute}
          title={track.muted ? 'Activer la piste' : 'Mute'}
        >
          M
        </button>
        <button
          className={`${styles.msBtn} ${track.solo ? styles.soloed : ''}`}
          onClick={handleSolo}
          title={track.solo ? 'Désactiver le solo' : 'Solo'}
        >
          S
        </button>
      </div>

      {/* Fader + VU-mètre */}
      <div className={styles.faderRow}>
        <Fader
          valueDb={isFinite(volumeDb) ? volumeDb : -60}
          min={-60}
          max={6}
          height={120}
          onChange={handleVolumeChange}
        />
        <VuMeter meter={meter ?? ZERO_METER} height={120} />
      </div>
    </div>
  );
}
