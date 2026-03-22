import { PlayButton } from './PlayButton';
import { StopButton } from './StopButton';
import { PauseButton } from './PauseButton';
import { TimeDisplay } from './TimeDisplay';
import { BpmControl } from './BpmControl';
import { MetronomeToggle } from './MetronomeToggle';
import { RecordButton } from './RecordButton';
import { LevelGate } from '../shared/LevelGate';
import { useTransport } from '../../hooks/useTransport';
import styles from './TransportBar.module.css';

export function TransportBar() {
  const {
    isPlaying,
    isRecording,
    position,
    bpm,
    metronomeEnabled,
    play,
    pause,
    stop,
    setBpm,
    toggleRecording,
    toggleMetronome,
  } = useTransport();

  return (
    <div className={styles.bar}>
      {/* ─── Contrôles essentiels (niveau 1+) ──────────────────────── */}
      <PlayButton isPlaying={isPlaying} onPlay={play} />
      <StopButton onStop={stop} />

      {/* ─── Pause (niveau 2+) ──────────────────────────────────────── */}
      <LevelGate level={2}>
        <PauseButton isPlaying={isPlaying} onPause={pause} />
      </LevelGate>

      {/* ─── Affichage du temps (niveau 1+) ─────────────────────────── */}
      <TimeDisplay positionSecs={position} />

      {/* ─── BPM (niveau 2+) ─────────────────────────────────────────── */}
      <LevelGate level={2}>
        <BpmControl bpm={bpm} onChange={setBpm} />
      </LevelGate>

      {/* ─── Métronome (niveau 2+) ───────────────────────────────────── */}
      <LevelGate level={2}>
        <MetronomeToggle enabled={metronomeEnabled} onToggle={toggleMetronome} />
      </LevelGate>

      {/* ─── Enregistrement (niveau 4+) ─────────────────────────────── */}
      <LevelGate level={4}>
        <RecordButton isRecording={isRecording} onToggle={toggleRecording} />
      </LevelGate>
    </div>
  );
}
