import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, ROLE_NAV, ROLE_USER } from '../lib/nav.js';
import { roleHome, useMockAuth } from '../lib/auth.jsx';
import { Button } from './ui.jsx';

const ROLES = ['student', 'parent', 'coordinator', 'evaluator', 'admin'];

function pageTitle(path) {
  const seg = path.split('/').filter(Boolean).pop() || 'dashboard';
  return seg.split('-').map((x) => x[0].toUpperCase() + x.slice(1)).join(' ');
}

export function Shell({ role, children }) {
  const { session, switchRole, signOut } = useMockAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const user = ROLE_USER[session.role] || ROLE_USER.student;
  const nav = ROLE_NAV[role] || [];

  const notify = (msg) => {
    setToast(msg);
    clearTimeout(window.__emToast);
    window.__emToast = setTimeout(() => setToast(''), 2500);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className={`sidebar${open ? ' open' : ''}`} id="sidebar">
        <Link className="app-brand" to="/">Elevate<span>Me</span></Link>
        <div className="preview-label">Interactive preview</div>
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
          <div className="avatar">{user.initials}</div>
          <div><strong>{user.name}</strong><span>{user.meta}</span></div>
          <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={() => { signOut(); navigate('/sign-in'); }}>↗</button>
        </div>
      </aside>
      <div className="app-area">
        <header className="app-topbar">
          <button className="mobile-toggle" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Menu</button>
          <div className="crumb">{ROLE_LABEL[role]} / {pageTitle(location.pathname)}</div>
          <div className="top-actions">
            <label className="role-picker">
              <span>Preview as</span>
              <select
                aria-label="Preview as role"
                value={session.role}
                onChange={(e) => { switchRole(e.target.value); navigate(roleHome(e.target.value)); }}
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <button className="notification-button" aria-label="Notifications" onClick={() => notify('3 unread notifications')}>03</button>
          </div>
        </header>
        <main id="main" className="main-content" tabIndex={-1}>{children}</main>
      </div>
      <div role="status" aria-live="polite" className={`toast${toast ? ' show' : ''}`}>{toast}</div>
    </div>
  );
}

export function RequireRole({ allow, label, children }) {
  const { session, switchRole } = useMockAuth();
  const navigate = useNavigate();
  if (allow.includes(session.role)) return <>{children}</>;
  const fallback = roleHome(allow[0]);
  return (
    <div className="empty" role="alert" style={{ textAlign: 'left' }}>
      <h2>Permission denied</h2>
      <p>The {label} workspace requires one of: {allow.join(', ')}. You are previewing as {session.role}.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Link to={fallback} className="button secondary">Open {allow[0]} workspace</Link>
        <Button onClick={() => { switchRole(allow[0]); navigate(fallback); }}>Switch to {allow[0]}</Button>
      </div>
    </div>
  );
}
