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
export function ViewSwitcher({ sentFrom, view: controlledView, onViewChange }: { sentFrom?: string; view?: ViewPref; onViewChange?: (v: ViewPref) => void }) {
  const [internal, setInternal] = useState<ViewPref>(() => {
    if (controlledView) return controlledView;
    try { return normalizeViewPref(localStorage.getItem(VIEW_PREF_KEY)); } catch { return 'student'; }
  });
  const view = controlledView ?? internal;
  function persist(next: ViewPref) {
    try { localStorage.setItem(VIEW_PREF_KEY, next); } catch { /* noop */ }
    try { window.dispatchEvent(new CustomEvent<ViewPref>('em:view-change', { detail: next })); } catch { /* noop */ }
  }
  function handleSelect(next: ViewPref) {
    if (controlledView && onViewChange) {
      onViewChange(next);
      persist(next);
      return;
    }
    setInternal(next);
  }
  useEffect(() => {
    if (controlledView && onViewChange) return;
    persist(view);
    // Best-effort server persistence; failures must not block rendering.
    patch('/me', undefined, { headers: { 'X-View-Mode': view } } as RequestInit).catch(() => {});
  }, [view, controlledView, onViewChange]);
  useEffect(() => {
    if (!controlledView || !onViewChange) return;
    persist(view);
    patch('/me', undefined, { headers: { 'X-View-Mode': view } } as RequestInit).catch(() => {});
  }, [view, controlledView, onViewChange]);
  return (
    <div className={styles.wrap} data-testid="view-switcher">
      <div role="group" aria-label="View preference">
        <button type="button" className={view === 'student' ? styles.active : ''} aria-pressed={view === 'student'} onClick={() => handleSelect('student')}>Student view</button>
        <button type="button" className={view === 'parent' ? styles.active : ''} aria-pressed={view === 'parent'} onClick={() => handleSelect('parent')}>Parent view</button>
      </div>
      {sentFrom && <small className={styles.meta}>Sent from {sentFrom} view</small>}
    </div>
  );
}
