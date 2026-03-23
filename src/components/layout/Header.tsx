import { TransportBar } from '../transport/TransportBar';
import { ProfileSwitcher } from './ProfileSwitcher';
import { ProjectMenu } from './ProjectMenu';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <ProjectMenu />
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
