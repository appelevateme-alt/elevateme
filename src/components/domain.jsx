import { useState as useStateSafe } from 'react';
import { Link } from 'react-router-dom';
import { Button, Status, Tag } from './ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useSupabaseMutation } from '../lib/useSupabase.js';

/* ---------- Program flat-list row ---------- */
export function ProgramListRow({ date, type, title, meta, status, linkTo, actionLabel = 'View →' }) {
  return (
    <article className="list-row">
      <div className="row-meta">{date}<br />{type}</div>
      <div className="row-main"><h3>{linkTo ? <Link to={linkTo}>{title}</Link> : title}</h3><p>{meta}</p></div>
      <div className="row-action">
        {status && <Status value={status} />}
        {linkTo && <Link to={linkTo} className="button secondary small">{actionLabel}</Link>}
      </div>
    </article>
  );
}

/* ---------- Prototype line chart (blue on grid) ---------- */
export function LineChart() {
  return (
    <>
      <div className="chart">
        <svg viewBox="0 0 700 260" preserveAspectRatio="none" role="img" aria-label="Performance total rising across six sessions">
          <path d="M8 220 C90 210,105 181,145 187 S236 208,284 145 S372 120,418 130 S505 92,552 65 S635 52,692 22" fill="none" stroke="#1a49e7" strokeWidth="5" vectorEffect="non-scaling-stroke" />
          <g fill="#fff" stroke="#111216" strokeWidth="3">
            <circle cx="8" cy="220" r="7" /><circle cx="145" cy="187" r="7" /><circle cx="284" cy="145" r="7" />
            <circle cx="418" cy="130" r="7" /><circle cx="552" cy="65" r="7" /><circle cx="692" cy="22" r="8" fill="#c8ff65" />
          </g>
        </svg>
      </div>
      <div className="chart-axis">
        <span>Session 01</span><span>Session 02</span><span>Session 03</span>
        <span>Session 04</span><span>Session 05</span><span>Session 06</span>
      </div>
    </>
  );
}

export function ChartSummary({ label, value, status }) {
  return (
    <div className="chart-summary">
      <div><span>{label}</span><br /><b>{value}</b></div>
      {status}
    </div>
  );
}

/* ---------- Insight list ---------- */
export function InsightList({ items }) {
  return (
    <div className="insight-list">
      {items.map((it, i) => (
        <div className="insight-item" key={i}>
          <label>{it.label}</label>
          <p>{it.text}{it.small && <small>{it.small}</small>}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Recommendation record ---------- */
export function RecommendationRecord({ date, status, title, body, tags, action }) {
  return (
    <article className="recommendation">
      <div className="date">{date}<br />{status && <Status value={status} />}</div>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
        {tags && <p style={{ marginTop: 10 }}>{tags}</p>}
      </div>
      <div className="row-action">{action}</div>
    </article>
  );
}

/* ---------- Announcement row ---------- */
export function AnnouncementRow({ date, sender, title, body, badge, action }) {
  return (
    <article className="list-row">
      <div className="row-meta">{date}<br />{sender}</div>
      <div className="row-main"><h3>{title}</h3><p>{body}</p></div>
      <div className="row-action">{badge}{action}</div>
    </article>
  );
}

/* ---------- Messages ---------- */
export function MessageItemRow({ date, from, subject, preview, status, to }) {
  return (
    <Link to={to} className="message-item">
      <div className="row-meta">{date}<br />{from}</div>
      <div><h3>{subject}</h3><p>{preview}</p></div>
      <Status value={status} />
    </Link>
  );
}

export function ThreadMessage({ author, when, body, admin }) {
  return (
    <article className={`thread-message${admin ? ' admin' : ''}`}>
      <header><strong>{author}</strong><span>{when}</span></header>
      <p>{body}</p>
    </article>
  );
}

/* ---------- L/G/VG/E score input (50+ model) ---------- */
export function ScoreInput({ index, label, value, onChange }) {
  return (
    <div className="score-row">
      <span className="number">{String(index + 1).padStart(2, '0')}</span>
      <strong>{label}</strong>
      <div className="score-options" role="radiogroup" aria-label={`${label} score`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`score-option${value === n ? ' selected' : ''}`}
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Registration panel (Supabase-backed, prototype classes kept) ---------- */
export function RegistrationPanel({ programTitle, programId, sessions = [], closed, notify }) {
  const { session } = useAuth();
  const { create, saving, error: mutationError } = useSupabaseMutation({ table: 'registrations' });
  const [choiceState, setChoiceState] = useStateSafe('');
  const choice = choiceState || sessions[0]?.id || '';
  const setChoice = setChoiceState;
  const [confirming, setConfirming] = useStateSafe(false);
  const [submitted, setSubmitted] = useStateSafe(false);
  const [error, setError] = useStateSafe('');

  if (closed) {
    return <div className="notice"><strong>Registration closed.</strong> This program is no longer accepting registrations.</div>;
  }

  if (submitted) {
    const doneSession = sessions.find((s) => s.id === choice);
    return (
      <div className="notice">
        <strong>Registration pending.</strong> Your request for <strong>{programTitle}</strong>
        {doneSession && <> — <strong>{doneSession.title}</strong></>} is <strong>Pending</strong>.
        A coordinator will confirm or waitlist it; you will be notified of the outcome.
      </div>
    );
  }

  const combinedError = error || mutationError?.message || '';

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!confirming) { setConfirming(true); return; }
        setError('');
        if (!choice) { setError('Choose a session or committee before submitting. Your selection is preserved.'); return; }
        const resolvedProgramId = programId || sessions.find((s) => s.id === choice)?.programId || sessions[0]?.programId;
        if (!resolvedProgramId) { setError('Program is still loading. Your selection is preserved.'); return; }
        if (!session?.userId) { setError('Sign in with a student profile to register. Your selection is preserved.'); return; }
        try {
          const res = await create({
            program_id: resolvedProgramId,
            session_id: choice || null,
            student_id: session.userId,
            status: 'Pending',
          });
          if (res?.error) throw new Error(res.error.message);
          setSubmitted(true);
          notify?.('Registration submitted — Pending coordinator confirmation');
        } catch (err) {
          setError(`${err?.message || 'Registration failed. Please try again.'} Your selection is preserved.`);
        }
      }}
    >
      {sessions.length > 0 && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>
            <span style={{ display: 'block', marginBottom: 7, fontSize: '.75rem', fontWeight: 600 }}>Choose session / committee</span>
            <select value={choice} onChange={(e) => { setChoice(e.target.value); setConfirming(false); }} style={{ width: '100%' }}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.title} — {s.date}</option>)}
            </select>
          </label>
        </div>
      )}
      {confirming && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Confirm your registration.</strong> {programTitle}
          {sessions.find((s) => s.id === choice) && <> — {sessions.find((s) => s.id === choice)?.title}</>}.
          Submitting creates a <strong>Pending</strong> registration for coordinator confirmation.
        </div>
      )}
      {combinedError && <p role="alert" className="field-error" style={{ marginBottom: 14 }}>{combinedError}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : confirming ? 'Confirm registration' : 'Join this program'}</Button>
        {confirming && <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Back</Button>}
      </div>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Sign-in with a student profile is required. Duplicate, capacity, and eligibility checks run on submit.</p>
    </form>
  );
}

/* ---------- Workspace tabs (engineered flow) ---------- */
export function Tabs({ tabs, active, base }) {
  return (
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--ink)', marginBottom: 22 }}>
      {tabs.map((t) => {
        const href = t === tabs[0] ? base : `${base}/${t.toLowerCase()}`;
        const isActive = active === t;
        return (
          <Link
            key={t}
            to={href}
            aria-current={isActive ? 'page' : undefined}
            style={{
              display: 'block', whiteSpace: 'nowrap', padding: '10px 14px', fontSize: '.88rem', fontWeight: 600,
              color: isActive ? 'var(--blue)' : 'var(--muted)', textDecoration: 'none',
              borderBottom: isActive ? '2px solid var(--blue)' : '2px solid transparent',
            }}
          >
            {t}
          </Link>
        );
      })}
    </div>
  );
}

export function SkillTag({ children }) {
  return <Tag>{children}</Tag>;
}
