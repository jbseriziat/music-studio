import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useMixerStore } from '../stores/mixerStore';

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
  // Mastering (Phase 5.3)
  lufs_momentary?: number;
  lufs_shortterm?: number;
  lufs_integrated?: number;
  true_peak_db?: number;
  limiter_gr_db?: number;
  spectrum?: number[];
}

/**
 * Écoute les événements `audio://meters` émis par le moteur Rust (~30 fps)
 * et met à jour le mixerStore avec les données de VU-mètres.
 */
export function useMixerMeters() {
  const updateMeter = useMixerStore((s) => s.updateMeter);
  const updateMasterMeter = useMixerStore((s) => s.updateMasterMeter);
  const updateMasteringData = useMixerStore((s) => s.updateMasteringData);

  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen<MeterReportPayload>('audio://meters', (event) => {
      if (cancelled) return;
      const p = event.payload;

      for (const t of p.tracks) {
        updateMeter(String(t.track_id), {
          peakL: t.peak_l,
          peakR: t.peak_r,
          rmsL: t.rms_l,
          rmsR: t.rms_r,
        });
      }

      if (p.master) {
        updateMasterMeter({
          peakL: p.master.peak_l,
          peakR: p.master.peak_r,
          rmsL: p.master.rms_l,
          rmsR: p.master.rms_r,
        });
      }

      // Mastering data (Phase 5.3).
      if (p.spectrum !== undefined) {
        updateMasteringData({
          lufsMomentary: p.lufs_momentary ?? -70,
          lufsShortterm: p.lufs_shortterm ?? -70,
          lufsIntegrated: p.lufs_integrated ?? -70,
          truePeakDb: p.true_peak_db ?? -70,
          limiterGrDb: p.limiter_gr_db ?? 0,
          spectrum: p.spectrum ?? [],
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
  }, [updateMeter, updateMasterMeter, updateMasteringData]);
}
