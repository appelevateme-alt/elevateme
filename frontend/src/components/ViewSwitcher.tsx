import { useEffect, useState } from 'react';
import { patch } from '../lib/api';
import { VIEW_PREF_KEY, normalizeViewPref, type ViewPref } from '../lib/viewMode';
import styles from './ViewSwitcher.module.css';

// Presentation-only switcher.
//
// NEVER changes permissions: Student view / Parent view only affects layout.
// The preference is persisted via PATCH /me (server stores parent_view_mode)
// and sent as X-View-Mode header (see lib/api.ts) for informational purposes.
// Authorization is enforced server-side by ScopeGuard using DB roles —
// switching views cannot grant staff rights (see isolation.test.ts).
export function ViewSwitcher({ sentFrom }: { sentFrom?: string }) {
  const [view, setView] = useState<ViewPref>(() => {
    try { return normalizeViewPref(localStorage.getItem(VIEW_PREF_KEY)); } catch { return 'student'; }
  });
  useEffect(() => {
    try { localStorage.setItem(VIEW_PREF_KEY, view); } catch { /* noop */ }
    // Best-effort server persistence; failures must not block rendering.
    patch('/me', undefined, { headers: { 'X-View-Mode': view } } as RequestInit).catch(() => {});
  }, [view]);
  return (
    <div className={styles.wrap} data-testid="view-switcher">
      <div role="group" aria-label="View preference">
        <button className={view === 'student' ? styles.active : ''} onClick={() => setView('student')}>Student view</button>
        <button className={view === 'parent' ? styles.active : ''} onClick={() => setView('parent')}>Parent view</button>
      </div>
      {sentFrom && <small className={styles.meta}>Sent from {sentFrom} view</small>}
    </div>
  );
}
