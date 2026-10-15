import { ReportNotifications } from '../features/evaluator-access/ReportNotifications.jsx';
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, ROLE_NAV } from '../lib/nav.js';
import { roleHome, useAuth } from '../lib/auth.jsx';
import { Button } from './ui.jsx';

const ROLES = ['student', 'parent', 'teacher', 'admin'];

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


/* ---------- Sidebar icons (24x24 line icons) ---------- */
const I = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  cap: <><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></>,
  ticket: <><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>,
  bulb: <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></>,
  megaphone: <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  message: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  clipboard: <><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>,
  fileCheck: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8" /><path d="m15 7 3 3" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></>,
  dot: <><circle cx="12" cy="12" r="3" /></>,
};
const NAV_ICON = {
  'Overview': I.home, 'Student overview': I.home,
  'Programs': I.cap, 'My registrations': I.ticket, 'Performance': I.chart,
  'Recommendations': I.bulb, 'Announcements': I.megaphone, 'Profile': I.user,
  'Messages': I.message, 'Approval queue': I.clipboard, 'Users': I.users,
  'Evaluations': I.fileCheck, 'Evaluation review': I.fileCheck, 'Students': I.users, 'Evaluator access': I.key, 'Report delivery': I.send,
  'Public website': I.globe, 'Create account': I.userPlus,
};
function NavIcon({ label }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{NAV_ICON[label] || I.dot}</svg>;
}

const ROLE_PREVIEW_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_ROLE_PREVIEW === 'true';

export function Shell({ role, children }) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // student and admin workspaces use the dark theme (same look as the landing page)
  useEffect(() => {
    if (role !== 'student' && role !== 'admin' && role !== 'teacher') return undefined;
    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    return () => root.removeAttribute('data-theme');
  }, [role]);
  const [previewRole, setPreviewRole] = useState(null);
  const nav = ROLE_NAV[role] || [];

  const displayName = session?.name || 'Account';
  const displayMeta = session?.elevateMeId
    ? `${ROLE_LABEL[session.role] || session.role} · ${session.elevateMeId}`
    : session
      ? `${ROLE_LABEL[session.role] || session.role} · ${session.email}`
      : 'Signed out';

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className={`sidebar${open ? ' open' : ''}`} id="sidebar">
        <Link className="app-brand" to="/" aria-label="ElevateMe home"><img src="/images/logo.png" alt="ElevateMe" /></Link>
        <nav className="side-nav" aria-label="Application navigation">
          <div className="nav-group">{ROLE_LABEL[role]} workspace</div>
          {nav.map((n) => (
            <NavLink key={n.href} to={n.href} end={n.href === `/${role}`} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-label"><NavIcon label={n.label} />{n.label}</span>
            </NavLink>
          ))}
          <div className="nav-group">Website</div>
          <Link className="nav-link" to="/"><span className="nav-label"><NavIcon label="Public website" />Public website</span><span>↗</span></Link>
          <Link className="nav-link" to="/sign-up"><span className="nav-label"><NavIcon label="Create account" />Create account</span><span>↗</span></Link>
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
          </div>
        </header>
        <main id="main" className="main-content" tabIndex={-1}>{['admin', 'teacher', 'student', 'parent'].includes(role) && <ReportNotifications />}{children}</main>
      </div>
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