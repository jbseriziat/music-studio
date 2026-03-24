import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useMixerStore } from '../stores/mixerStore';
import type { MeterData } from '../stores/mixerStore';

interface TrackMeterPayload {
  track_id: number;
  peak_l: number;
  peak_r: number;
  rms_l: number;
  rms_r: number;
}

interface MeterReportPayload {
  tracks: TrackMeterPayload[];
  master: { peak_l: number; peak_r: number; rms_l: number; rms_r: number };
}

/**
 * Écoute les événements `audio://meters` émis par le moteur Rust (~30 fps)
 * et met à jour le mixerStore avec les données de VU-mètres.
 */
export function useMixerMeters() {
  const updateMeter = useMixerStore((s) => s.updateMeter);
  const updateMasterMeter = useMixerStore((s) => s.updateMasterMeter);

  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen<MeterReportPayload>('audio://meters', (event) => {
      if (cancelled) return;
      const { tracks, master } = event.payload;

      for (const t of tracks) {
        const data: MeterData = {
          peakL: t.peak_l,
          peakR: t.peak_r,
          rmsL: t.rms_l,
          rmsR: t.rms_r,
        };
        updateMeter(String(t.track_id), data);
      }

      if (master) {
        updateMasterMeter({
          peakL: master.peak_l,
          peakR: master.peak_r,
          rmsL: master.rms_l,
          rmsR: master.rms_r,
        });
      }
    }).catch((err) => {
      console.warn('[useMixerMeters] listen() error:', err);
      return () => {};
    });

    return () => {
      cancelled = true;
      unlistenPromise.then((fn) => fn());
    };
  }, [updateMeter, updateMasterMeter]);
}
