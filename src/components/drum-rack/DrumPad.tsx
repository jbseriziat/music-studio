import { useCallback, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useDrumStore } from '../../stores/drumStore';
import { SamplePickerDialog } from '../sound-pad/SamplePickerDialog';
import styles from './DrumPad.module.css';

interface Props {
  padIndex: number;
  padName: string;
  padIcon: string;
  padColor: string;
  /** Volume du pad : 0.0–2.0. */
  volume: number;
  /** Pitch du pad : −12 à +12 demi-tons. */
  pitch: number;
}

/**
 * Pad du drum rack : bouton de déclenchement + popover de réglages (volume, pitch, sample).
 * - Clic sur le pad → joue le son + animation pulse.
 * - Clic droit OU bouton ⚙ → ouvre le popover de réglages.
 */
export function DrumPad({ padIndex, padName, padIcon, padColor, volume, pitch }: Props) {
  const { triggerPad, setPadVolume, setPadPitch, assignPad } = useDrumStore();

  const [pulsing, setPulsing]           = useState(false);
  const [popoverOpen, setPopoverOpen]   = useState(false);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Déclenchement du son + animation ──────────────────────────────────────
  const handleTrigger = useCallback(() => {
    triggerPad(padIndex);
    setPulsing(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulsing(false), 160);
  }, [triggerPad, padIndex]);

  // ── Clic droit → ouvrir les réglages ─────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setPopoverOpen(true);
  }, []);

  // ── Réglages volume / pitch ───────────────────────────────────────────────
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPadVolume(padIndex, parseFloat(e.target.value));
    },
    [setPadVolume, padIndex],
  );

  const handlePitchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPadPitch(padIndex, parseFloat(e.target.value));
    },
    [setPadPitch, padIndex],
  );

  // ── Changement de sample ──────────────────────────────────────────────────
  const handleSampleSelect = useCallback(
    (sampleId: number, sampleName: string) => {
      assignPad(padIndex, sampleId, sampleName);
    },
    [assignPad, padIndex],
  );

  const pitchLabel = pitch === 0 ? '0' : pitch > 0 ? `+${pitch}` : `${pitch}`;

  return (
    <div
      className={`${styles.wrapper} ${pulsing ? styles.pulsing : ''}`}
      style={{ '--pad-color': padColor } as React.CSSProperties}
      onContextMenu={handleContextMenu}
    >
      {/* ─── Bouton pad principal ───────────────────────────────────────── */}
      <button
        className={styles.padBtn}
        onClick={handleTrigger}
        aria-label={`Jouer ${padName}`}
        title={`${padName} — clic droit pour les réglages`}
      >
        <span className={styles.padIcon}>{padIcon}</span>
        <span className={styles.padName}>{padName}</span>

        {/* Indicateur de volume (petite barre en bas) */}
        <span
          className={styles.volumeBar}
          style={{ width: `${Math.min(volume / 2, 1) * 100}%` }}
        />
      </button>

      {/* ─── Bouton ⚙ + Popover de réglages ─────────────────────────────── */}
      <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
        <Popover.Trigger asChild>
          <button
            className={styles.settingsBtn}
            aria-label={`Réglages ${padName}`}
            title="Réglages"
            onClick={(e) => { e.stopPropagation(); setPopoverOpen(true); }}
          >
            ⚙
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className={styles.popover}
            side="right"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className={styles.popoverTitle}>{padIcon} {padName}</div>

            {/* Volume */}
            <label className={styles.paramLabel}>
              Volume : <strong>{Math.round(volume * 100)}%</strong>
            </label>
            <input
              type="range"
              min={0} max={2} step={0.05}
              value={volume}
              onChange={handleVolumeChange}
              className={styles.slider}
            />

            {/* Pitch */}
            <label className={styles.paramLabel}>
              Pitch : <strong>{pitchLabel} st</strong>
            </label>
            <input
              type="range"
              min={-12} max={12} step={1}
              value={pitch}
              onChange={handlePitchChange}
              className={styles.slider}
            />

            {/* Changer le sample */}
            <button
              className={styles.changeBtn}
              onClick={() => { setPopoverOpen(false); setPickerOpen(true); }}
            >
              🎵 Changer le son
            </button>

            <Popover.Arrow className={styles.popoverArrow} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* ─── Dialog de choix de sample ───────────────────────────────────── */}
      <SamplePickerDialog
        padId={padIndex}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSampleSelect}
      />
    </div>
  );
}
