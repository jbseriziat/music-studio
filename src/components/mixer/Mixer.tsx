import { useState, useCallback, useEffect } from 'react';
import { useTracksStore } from '../../stores/tracksStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useMixerMeters } from '../../hooks/useMixerMeters';
import { ChannelStrip } from './ChannelStrip';
import { MasterStrip } from './MasterStrip';
import { BusStrip } from './BusStrip';
import { createBus, deleteBus, addBusEffect } from '../../utils/tauri-commands';
import styles from './Mixer.module.css';

interface BusInfo {
  id: number;
  name: string;
  volume: number;
}

/**
 * Console de mixage — pistes + bus (Phase 5.4) + master.
 */
export function Mixer() {
  useMixerMeters();

  const tracks = useTracksStore((s) => s.tracks);
  const updateTrack = useTracksStore((s) => s.updateTrack);
  const level = useSettingsStore((s) => s.currentLevel);
  const [buses, setBuses] = useState<BusInfo[]>([]);

  // Créer les bus par défaut au niveau 5 au premier rendu.
  useEffect(() => {
    if (level < 5 || buses.length > 0) return;
    (async () => {
      try {
        const revId = await createBus('Reverb Bus');
        await addBusEffect(revId, 'reverb');
        const delId = await createBus('Delay Bus');
        await addBusEffect(delId, 'delay');
        setBuses([
          { id: revId, name: 'Reverb Bus', volume: 1.0 },
          { id: delId, name: 'Delay Bus', volume: 1.0 },
        ]);
      } catch (err) {
        console.error('[Mixer] Failed to create default buses:', err);
      }
    })();
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddBus = useCallback(async () => {
    try {
      const id = await createBus(`Bus ${buses.length + 1}`);
      setBuses(prev => [...prev, { id, name: `Bus ${prev.length + 1}`, volume: 1.0 }]);
    } catch (err) {
      console.error('[Mixer] create bus error:', err);
    }
  }, [buses.length]);

  const handleDeleteBus = useCallback(async (busId: number) => {
    try {
      await deleteBus(busId);
      setBuses(prev => prev.filter(b => b.id !== busId));
    } catch (err) {
      console.error('[Mixer] delete bus error:', err);
    }
  }, []);

  const handleBusVolume = useCallback((busId: number, volume: number) => {
    setBuses(prev => prev.map(b => b.id === busId ? { ...b, volume } : b));
  }, []);

  return (
    <div className={styles.mixer} aria-label="Console de mixage">
      {tracks.map((track, index) => (
        <ChannelStrip
          key={track.id}
          track={track}
          trackIndex={index}
          buses={buses}
          onMuteToggle={(muted) => updateTrack(track.id, { muted })}
          onSoloToggle={(solo) => updateTrack(track.id, { solo })}
          onVolumeChange={(volume) => updateTrack(track.id, { volume })}
          onPanChange={(pan) => updateTrack(track.id, { pan })}
        />
      ))}

      {/* Bus strips — Phase 5.4 */}
      {level >= 5 && buses.length > 0 && (
        <>
          <div className={styles.separator} />
          {buses.map(bus => (
            <BusStrip
              key={bus.id}
              busId={bus.id}
              name={bus.name}
              volume={bus.volume}
              onVolumeChange={(v) => handleBusVolume(bus.id, v)}
              onDelete={() => handleDeleteBus(bus.id)}
            />
          ))}
          {buses.length < 4 && (
            <button className={styles.addBusBtn} onClick={handleAddBus} title="Ajouter un bus">
              + Bus
            </button>
          )}
        </>
      )}

      <div className={styles.separator} />

      <MasterStrip />
    </div>
  );
}
