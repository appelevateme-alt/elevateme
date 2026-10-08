import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TEN_CRITERIA } from '../../lib/scores.js';
import { accessApi, deadline } from './api.js';
import './access.css';

export function GuestWorkspace() {
  const initialToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.slice(1)).get('t') : null;
  const token = useRef(initialToken);
  const [hasInvitation, setHasInvitation] = useState(Boolean(initialToken));
  const [workspace, setWorkspace] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [scores, setScores] = useState({});
  const [feedback, setFeedback] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expired, setExpired] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const activationLock = useRef(false);
  const expiryAt = useRef(null);

  function fail(e) {
    setError(e.message);
    if (e.status === 401) { setExpired(true); setWorkspace(null); setSheet(null); setScores({}); setFeedback(''); setDirty(false); }
  }
  async function refresh() {
    const next = await accessApi('/workspace');
    expiryAt.current = Date.now() + Math.max(0, Date.parse(next.expiresAt) - Date.parse(next.serverTime));
    setWorkspace(next); setExpired(false); return next;
  }
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    if (!token.current) refresh().catch(fail);
  }, []);
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!workspace) return undefined;
    const tick = () => {
      const left = Math.max(0, expiryAt.current - Date.now()); setRemaining(left);
      if (left === 0) fail({ status: 401, message: 'Your access has expired. Saved drafts remain with DI. Ask for a replacement link.' });
    };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [workspace]);
  async function activate() {
    if (activationLock.current) return; activationLock.current = true;
    setBusy(true); setError('');
    try {
      // An already activated browser resumes without trying to consume a link again.
      try { await refresh(); } catch (e) { if (e.status !== 401) throw e; await accessApi('/activate', { method: 'POST', body: { token: token.current } }); await refresh(); }
      token.current = null; setHasInvitation(false);
    } catch (e) { fail(e); } finally { setBusy(false); activationLock.current = false; }
  }
  async function open(id) {
    if (dirty && !window.confirm('Leave this sheet without saving your latest changes?')) return;
    setBusy(true); setError(''); setNotice('');
    try { const row = await accessApi(`/sheets/${id}`); setSheet(row); setScores(row.scores); setFeedback(row.feedback); setDirty(false); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function save(submit = false) {
    if (submit && !window.confirm('Submit this report to DI for review? You cannot edit it unless DI requests changes.')) return;
    setBusy(true); setError('');
    try {
      const row = await accessApi(`/sheets/${sheet.id}${submit ? '/submit' : ''}`, { method: submit ? 'POST' : 'PUT', body: { version: sheet.version, scores, feedback } });
      setSheet(row); setDirty(false); setNotice(submit ? 'Submitted — awaiting DI review.' : 'Draft saved.'); await refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function logout() {
    try { await accessApi('/logout', { method: 'POST' }); } catch { /* cookie expiry is best effort */ }
    setWorkspace(null); setSheet(null); setScores({}); setFeedback(''); setDirty(false); setConfirmed(false); setHasInvitation(false); setError(''); setNotice('');
  }
  const editable = sheet && ['DRAFT', 'CHANGES_REQUESTED'].includes(sheet.state);
  const complete = TEN_CRITERIA.every(({ key }) => Number.isInteger(scores[key]) && scores[key] >= 0 && scores[key] <= 100);
  const next = workspace?.students[workspace.students.findIndex((s) => s.id === sheet?.id) + 1];
  return <main className="access-page">
    <Link to="/" className="app-brand">ElevateMe</Link>
    <h1>Evaluator workspace</h1>
    {error && <p role="alert" className="notice">{error}</p>}
    {!workspace && !expired && <section className="panel access-card"><h2>Your invitation</h2><p>Use this link once to begin. Access ends at the deadline set by DI. Your saved work is kept for review.</p><button className="button" disabled={busy || !hasInvitation} onClick={activate}>{busy ? 'Opening…' : 'Start evaluation'}</button>{!hasInvitation && <p>Open the invitation provided by DI.</p>}</section>}
    {workspace && <>
      <section className="panel access-card"><h2>{workspace.identity.name}</h2><p>{workspace.identity.organisation} {workspace.identity.title}</p><p>Access ends {deadline(workspace.expiresAt)}</p>
        {remaining !== null && remaining < 15 * 60 * 1000 && <p role="status">Less than 15 minutes remain. Save your work now.</p>}
        {!confirmed && <><p>Check that these are your details. Contact DI if anything is incorrect.</p><button className="button" onClick={() => setConfirmed(true)}>These are my details</button></>}
        <button className="button quiet small" onClick={logout}>End this session</button>
      </section>
      {confirmed && <div className="access-grid">
        <section className="panel access-card"><h2>Assigned students</h2>{workspace.students.length === 0 && <p>No students are assigned. Contact DI.</p>}
          {workspace.students.map((s) => <button key={s.id} className="access-roster" disabled={busy} onClick={() => open(s.id)}><strong>{s.full_name}</strong><span>{s.elevate_me_id} · {s.state.replaceAll('_', ' ').toLowerCase()}</span></button>)}
        </section>
        {sheet && <section className="panel access-card"><h2>{sheet.full_name}</h2><p>{sheet.program_title} · {sheet.session_title}</p>
          {sheet.change_request && <p className="notice"><strong>DI requested changes:</strong> {sheet.change_request}</p>}
          {TEN_CRITERIA.map((c) => <label className="access-score" key={c.key}><span>{c.label}</span><input type="number" min="0" max="100" step="1" disabled={!editable || busy} value={scores[c.key] ?? ''} onChange={(e) => { setScores((s) => { const n = { ...s }; if (e.target.value === '') delete n[c.key]; else n[c.key] = Number(e.target.value); return n; }); setDirty(true); }} /></label>)}
          <label className="access-field">Student-facing feedback<textarea rows="5" maxLength="4000" disabled={!editable || busy} value={feedback} onChange={(e) => { setFeedback(e.target.value); setDirty(true); }} /></label>
          <p role="status">{dirty ? 'Unsaved changes' : notice || (editable ? 'Saved draft' : 'Submitted — read-only')}</p>
          <div className="access-actions">{editable && <><button className="button secondary" disabled={busy} onClick={() => save()}>Save draft</button><button className="button" disabled={busy || !complete} onClick={() => save(true)}>Submit to DI for review</button></>}{next && <button className="button secondary" disabled={busy} onClick={() => open(next.id)}>Next student</button>}</div>
          {error && <button className="button secondary" onClick={() => open(sheet.id)}>Reload saved sheet</button>}
        </section>}
      </div>}
    </>}
  </main>;
}
