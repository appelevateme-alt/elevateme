import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { navForSession } from '../lib/permissions';
import styles from './AppShell.module.css';

function DeferredBadge() {
  return (
    <span className={styles.deferred} title="Planned for a later release — see docs">
      Deferred
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, switchActiveRole, signOut } = useAuth();
  const location = useLocation();
  const sections = navForSession(session);

  return (
    <div className={styles.shell} data-testid="app-shell">
      <a className={styles.skip} href="#main">Skip to content</a>
      <aside className={styles.sidebar} aria-label="Application navigation">
        <a className={styles.brand} href="/">ElevateMe</a>
        {session && (
          <p className={styles.who} data-testid="nav-who">
            {session.email} · {session.activeRole}
          </p>
        )}
        {session && session.roles.length > 1 && (
          <label className={styles.roleSwitch}>Active role
            <select
              value={session.activeRole}
              onChange={(e) => switchActiveRole(e.target.value as never)}
              aria-label="Active role"
            >
              {session.roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
        <nav aria-label="Sections">
          {sections.map((s) => (
            <section key={s.section} aria-label={s.section} className={styles.section}>
              <h2 className={styles.sectionTitle}>{s.section}</h2>
              <ul className={styles.nav}>
                {s.links.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      aria-current={location.pathname === l.to ? 'page' : undefined}
                      className={location.pathname === l.to ? styles.current : ''}
                    >
                      {l.label}
                    </Link>
                    {l.deferred && <DeferredBadge />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        {session && (
          <button type="button" onClick={() => void signOut()} className={styles.signout}>
            Sign out
          </button>
        )}
      </aside>
      <div className={styles.area}>
        <main id="main" className={styles.main} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
