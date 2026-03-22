import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { Header } from './Header';
import styles from './AppShell.module.css';

interface AppShellProps {
  sidebar?: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const currentTheme = useSettingsStore((s) => s.currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = currentTheme;
  }, [currentTheme]);

  return (
    <div className={styles.shell}>
      <Header />
      <div className={styles.body}>
        {sidebar && <aside className={styles.sidebar}>{sidebar}</aside>}
        <main className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
