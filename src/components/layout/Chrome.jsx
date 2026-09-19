import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PUBLIC_NAV, ROLE_NAV, ROLE_NAV_MORE } from '../../lib/nav.js';
import { roleHome, useMockAuth } from '../../lib/auth.jsx';
import { Button } from '../ui/Button.jsx';

const ROLES = ['student', 'parent', 'coordinator', 'evaluator', 'admin'];

export function SkipLink() {
  return <a href="#main-content" className="skip-link">Skip to content</a>;
}

export function TopBar() {
  const { session, switchRole } = useMockAuth();
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand-link">
          ElevateMe <span className="em-meta">· Diplomatic Impact</span>
        </Link>
        <nav aria-label="Public" className="topbar-nav">
          {PUBLIC_NAV.map((n) => (
            <Link key={n.href} to={n.href}>{n.label}</Link>
          ))}
        </nav>
        <div className="topbar-tools">
          <label className="sr-only" htmlFor="role-switch">Preview role</label>
          <select
            id="role-switch"
            value={session.role}
            onChange={(e) => {
              const r = e.target.value;
              switchRole(r);
              navigate(roleHome(r));
            }}
            className="select"
            style={{ minHeight: 36, width: 'auto' }}
            title="Demo role switcher (mock auth — no backend yet)"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <Link to="/sign-in" className="link-strong" style={{ fontSize: 14 }}>{session.name}</Link>
        </div>
      </div>
    </header>
  );
}

export function Breadcrumbs({ trail }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {trail.map((t, i) => (
          <li key={i}>
            {i > 0 && <span aria-hidden>/ </span>}
            {t.href ? <Link to={t.href}>{t.label}</Link> : <span aria-current="page">{t.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SideNav({ role }) {
  const items = [...ROLE_NAV[role], ...ROLE_NAV_MORE[role]];
  return (
    <nav aria-label={`${role} navigation`} className="sidenav">
      <ul>
        {items.map((n) => (
          <li key={n.href}>
            <NavLink to={n.href} end={n.href === `/${role}`} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileNavigation({ role }) {
  const items = ROLE_NAV[role].slice(0, 5);
  return (
    <nav aria-label={`${role} mobile`} className="mobile-nav">
      <ul>
        {items.map((n) => (
          <li key={n.href}>
            <NavLink to={n.href} end={n.href === `/${role}`} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function UserMenu() {
  const { session, signOut } = useMockAuth();
  return (
    <div className="user-menu">
      <p className="em-item-title">{session.name}</p>
      <p className="em-meta">{session.email} · {session.role} · {session.status}</p>
      <button onClick={signOut} className="btn btn-ghost" style={{ marginTop: 8, minHeight: 44 }}>
        Sign out (clears mock session)
      </button>
    </div>
  );
}

export function AppShell({ role, title, trail, children }) {
  useLocation();
  return (
    <div className="container app-shell">
      <div className="sidenav-sticky">
        <SideNav role={role} />
        <UserMenu />
        <p className="em-meta" style={{ marginTop: 8 }}>
          {title} workspace · mock auth — server authorization lands with the backend.
        </p>
      </div>
      <div style={{ minWidth: 0 }}>
        <MobileNavigation role={role} />
        {trail && <Breadcrumbs trail={trail} />}
        {children}
      </div>
    </div>
  );
}

// Client-side mock gate. Real server authorization ships with the backend.
export function RequireRole({ allow, label, children }) {
  const { session, switchRole } = useMockAuth();
  const navigate = useNavigate();
  if (allow.includes(session.role)) return <>{children}</>;
  const fallback = roleHome(allow[0]);
  return (
    <div className="em-card" role="alert">
      <p className="em-item-title">Permission denied</p>
      <p className="body-text">
        The {label} workspace requires one of: {allow.join(', ')}. You are previewing as {session.role}.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <Link to={fallback} className="btn">Open {allow[0]} workspace</Link>
        <Button
          variant="ghost"
          onClick={() => {
            switchRole(allow[0]);
            navigate(fallback);
          }}
        >
          Switch to {allow[0]}
        </Button>
      </div>
    </div>
  );
}
