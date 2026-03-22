import { TransportBar } from '../transport/TransportBar';
import { ProfileSwitcher } from './ProfileSwitcher';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <span className={styles.logo}>🎵</span>
        <span className={styles.appName}>Music Studio</span>
      </div>

      <div className={styles.center}>
        <TransportBar />
      </div>

      <div className={styles.right}>
        <ProfileSwitcher />
      </div>
    </header>
  );
}
