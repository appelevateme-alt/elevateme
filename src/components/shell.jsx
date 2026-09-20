import { useState } from 'react';
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, ROLE_NAV } from '../lib/nav.js';
import { roleHome, useAuth } from '../lib/auth.jsx';
import { Button } from './ui.jsx';

const ROLES = ['student', 'parent', 'coordinator', 'evaluator', 'admin'];

function pageTitle(path) {
  const seg = path.split('/').filter(Boolean).pop() || 'dashboard';
  return seg.split('-').map((x) => x[0].toUpperCase() + x.slice(1)).join(' ');
}

function initialsFor(name) {
  if (!name) return 'EM';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ROLE_PREVIEW_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_ROLE_PREVIEW === 'true';

export function Shell({ role, children }) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [previewRole, setPreviewRole] = useState(null);
  const nav = ROLE_NAV[role] || [];

  const displayName = session?.name || 'Account';
  const displayMeta = session?.elevateMeId
    ? `${ROLE_LABEL[session.role] || session.role} · ${session.elevateMeId}`
    : session
      ? `${ROLE_LABEL[session.role] || session.role} · ${session.email}`
      : 'Signed out';

  const notify = (msg) => {
    setToast(msg);
    clearTimeout(window.__emToast);
    window.__emToast = setTimeout(() => setToast(''), 2500);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className={`sidebar${open ? ' open' : ''}`} id="sidebar">
        <Link className="app-brand" to="/">Elevate<span>Me</span></Link>
        <nav className="side-nav" aria-label="Application navigation">
          <div className="nav-group">{ROLE_LABEL[role]} workspace</div>
          {nav.map((n) => (
            <NavLink key={n.href} to={n.href} end={n.href === `/${role}`} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span>{n.label}</span>
              {role === 'student' && n.href === '/student' && <span className="nav-count">03</span>}
              {role === 'admin' && n.href === '/admin' && <span className="nav-count">03</span>}
            </NavLink>
          ))}
          <div className="nav-group">Website</div>
          <Link className="nav-link" to="/"><span>Public website</span><span>↗</span></Link>
          <Link className="nav-link" to="/sign-up"><span>Create account</span><span>↗</span></Link>
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">{initialsFor(displayName)}</div>
          <div><strong>{displayName}</strong><span>{displayMeta}</span></div>
          <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={handleSignOut}>↗</button>
        </div>
      </aside>
      <div className="app-area">
        <header className="app-topbar">
          <button className="mobile-toggle" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Menu</button>
          <div className="crumb">{ROLE_LABEL[role]} / {pageTitle(location.pathname)}</div>
          <div className="top-actions">
            {ROLE_PREVIEW_ENABLED && (
              <label className="role-picker" title="Demo only — does not change your account role">
                <span>Demo preview</span>
                <select
                  aria-label="Demo preview role (does not change account)"
                  value={previewRole || session?.role || role}
                  onChange={(e) => { setPreviewRole(e.target.value); navigate(roleHome(e.target.value)); }}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </label>
            )}
            <button className="notification-button" aria-label="Notifications" onClick={() => notify('3 unread notifications')}>03</button>
          </div>
        </header>
        <main id="main" className="main-content" tabIndex={-1}>{children}</main>
      </div>
      <div role="status" aria-live="polite" className={`toast${toast ? ' show' : ''}`}>{toast}</div>
    </div>
  );
}

export function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="empty" role="status" aria-label="Loading session">
        <h2>Loading…</h2>
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }

  if (session.status !== 'Approved') {
    if (session.status === 'PendingReview') return <Navigate to="/pending-approval" replace />;
    if (session.status === 'ChangesRequested') return <Navigate to="/pending-approval?status=changes" replace />;
    if (session.status === 'Rejected') return <Navigate to="/account-rejected" replace />;
    if (session.status === 'Suspended') return <Navigate to="/account-suspended" replace />;
    return <Navigate to="/pending-approval" replace />;
  }

  return <>{children}</>;
}

export function RequireRole({ allow, label, children }) {
  const { session, loading, switchActiveRole } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="empty" role="status" aria-label="Loading session">
        <h2>Loading…</h2>
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!session) return null;
  if (allow.includes(session.role)) return <>{children}</>;
  // The user is signed in but opened a workspace they don't belong to (e.g. a
  // stale ?next= URL after sign-in). Send them to their OWN workspace, never
  // back to the denied one.
  const ownHome = roleHome(session.role) || '/';
  const fallback = roleHome(allow[0]) || '/';
  const canSwitch = session.availableRoles?.includes(allow[0]);
  return (
    <div className="empty" role="alert" style={{ textAlign: 'left' }}>
      <h2>Permission denied</h2>
      <p>The {label} workspace requires one of: {allow.join(', ')}. You are signed in as {session.role}.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Link to={ownHome} className="button secondary">Open {session.role} workspace</Link>
        {canSwitch && <Button onClick={async () => { await switchActiveRole(allow[0]); navigate(fallback); }}>Switch to {allow[0]}</Button>}
      </div>
    </div>
  );
}
