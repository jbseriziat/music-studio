
import { PlayButton } from './PlayButton';
import { StopButton } from './StopButton';
import { TimeDisplay } from './TimeDisplay';
import { BpmControl } from './BpmControl';
import { LevelGate } from '../shared/LevelGate';
import { useTransport } from '../../hooks/useTransport';
import styles from './TransportBar.module.css';

export function TransportBar() {
  const { isPlaying, position, bpm, play, stop, setBpm } = useTransport();

  return (
    <div className={styles.bar}>
      <PlayButton isPlaying={isPlaying} onPlay={play} />
      <StopButton onStop={stop} />
      <TimeDisplay positionSecs={position} />
      <LevelGate level={2}>
        <BpmControl bpm={bpm} onChange={setBpm} />
      </LevelGate>
    </div>
  );
}
