import { useTracksStore } from '../../stores/tracksStore';
import { useMixerMeters } from '../../hooks/useMixerMeters';
import { ChannelStrip } from './ChannelStrip';
import { MasterStrip } from './MasterStrip';
import styles from './Mixer.module.css';

/**
 * Console de mixage — affiche une tranche par piste + la tranche Master.
 * Visible à partir du niveau 4.
 */
export function Mixer() {
  // Abonnement aux événements VU-mètres Rust.
  useMixerMeters();

  const tracks = useTracksStore((s) => s.tracks);
  const updateTrack = useTracksStore((s) => s.updateTrack);

  return (
    <div className={styles.mixer} aria-label="Console de mixage">
      {tracks.map((track, index) => (
        <ChannelStrip
          key={track.id}
          track={track}
          trackIndex={index}
          onMuteToggle={(muted) => updateTrack(track.id, { muted })}
          onSoloToggle={(solo) => updateTrack(track.id, { solo })}
          onVolumeChange={(volume) => updateTrack(track.id, { volume })}
          onPanChange={(pan) => updateTrack(track.id, { pan })}
        />
      ))}

      <div className={styles.separator} />

      <MasterStrip />
    </div>
  );
}
