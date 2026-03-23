import { useDrumStore } from '../../stores/drumStore';
import { useDrumSequencer } from '../../hooks/useDrumSequencer';
import { StepSequencer } from './StepSequencer';
import { DrumKitSelector } from './DrumKitSelector';
import styles from './DrumRack.module.css';

/** Kits prédéfinis : patterns simples prêts à l'emploi. */
const PRESETS = [
  { label: '🥁 Basique', steps: [
    [0,8], [4,12], [0,2,4,6,8,10,12,14], [], [4,12], [], [], []
  ]},
  { label: '🎸 Rock', steps: [
    [0,6,8], [4,12], [0,2,4,6,8,10,12,14], [], [4,12], [0], [], []
  ]},
  { label: '💃 Latin', steps: [
    [0,3,8,11], [6,14], [0,4,6,8,12,14], [], [2,10], [], [], []
  ]},
  { label: '✨ Vide', steps: [[], [], [], [], [], [], [], []]},
];

export function DrumRack() {
  useDrumSequencer();

  const { setStepCount, stepCount, applyPattern } = useDrumStore();

  const applyPreset = (preset: typeof PRESETS[number]) => {
    const pads: boolean[][] = Array.from({ length: 8 }, () => Array(32).fill(false));
    const velocities: number[][] = Array.from({ length: 8 }, () => Array(32).fill(1.0));
    preset.steps.forEach((activeSteps, pad) => {
      activeSteps.forEach((s) => { pads[pad][s] = true; });
    });
    applyPattern({ steps: 16, pads, velocities });
  };

  return (
    <div className={styles.rack}>
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <span className={styles.title}>🥁 Drum Rack</span>

        {/* Nombre de steps */}
        <div className={styles.stepCountGroup}>
          {[8, 16, 32].map((n) => (
            <button
              key={n}
              className={`${styles.stepCountBtn} ${stepCount === n ? styles.active : ''}`}
              onClick={() => setStepCount(n)}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Sélecteur de kit */}
        <DrumKitSelector />

        {/* Presets de patterns */}
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={styles.presetBtn}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Séquenceur ─────────────────────────────────────────────────── */}
      <div className={styles.sequencerWrapper}>
        <StepSequencer />
      </div>

      {/* ─── Labels de beats (référence visuelle) ───────────────────────── */}
      <div className={styles.beatLabels} style={{ paddingLeft: '140px' }}>
        {Array.from({ length: stepCount }, (_, i) => (
          <div
            key={i}
            className={`${styles.beatLabel} ${i % 4 === 0 ? styles.beatAccent : ''}`}
          >
            {i % 4 === 0 ? i / 4 + 1 : '·'}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DrumRack;
