import React from 'react';
import styles from './AppShell.module.css';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell} data-testid="app-shell">
      <a className={styles.skip} href="#main">Skip to content</a>
      <aside className={styles.sidebar} aria-label="Application navigation">
        <a className={styles.brand} href="/">ElevateMe</a>
      </aside>
      <div className={styles.area}>
        <main id="main" className={styles.main} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
