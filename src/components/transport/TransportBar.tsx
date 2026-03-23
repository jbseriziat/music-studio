import { PlayButton } from './PlayButton';
import { StopButton } from './StopButton';
import { PauseButton } from './PauseButton';
import { TimeDisplay } from './TimeDisplay';
import { BpmControl } from './BpmControl';
import { MetronomeToggle } from './MetronomeToggle';
import { LoopButton } from './LoopButton';
import { RecordButton } from './RecordButton';
import { LevelGate } from '../shared/LevelGate';
import { useTransport } from '../../hooks/useTransport';
import { useTransportStore } from '../../stores/transportStore';
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
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const setLoop     = useTransportStore((s) => s.setLoop);

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

      {/* ─── Boucle (niveau 2+) ──────────────────────────────────────── */}
      <LevelGate level={2}>
        <LoopButton enabled={loopEnabled} onToggle={() => setLoop(!loopEnabled)} />
      </LevelGate>

      {/* ─── Enregistrement (niveau 4+) ─────────────────────────────── */}
      <LevelGate level={4}>
        <RecordButton isRecording={isRecording} onToggle={toggleRecording} />
      </LevelGate>
    </div>
  );
}
