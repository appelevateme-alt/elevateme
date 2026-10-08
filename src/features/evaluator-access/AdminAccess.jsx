import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TEN_CRITERIA } from '../../lib/scores.js';
import { adminApi, deadline } from './api.js';
import './access.css';

export function AdminInvitations() {
  const [sessions, setSessions] = useState([]); const [invitations, setInvitations] = useState([]);
  const [sessionId, setSessionId] = useState(''); const [students, setStudents] = useState([]); const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', organisation: '', title: '' });
  const [link, setLink] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const refresh = useCallback(() => adminApi('/invitations').then(setInvitations), []);
  useEffect(() => { Promise.all([adminApi('/sessions').then(setSessions), refresh()]).catch((e) => setError(e.message)); }, [refresh]);
  useEffect(() => {
    if (!sessionId) return undefined;
    const ac = new AbortController(); adminApi(`/sessions/${sessionId}/students`, { signal: ac.signal }).then(setStudents).catch((e) => { if (e.name !== 'AbortError') setError(e.message); }); return () => ac.abort();
  }, [sessionId]);
  async function perform(task) {
    setBusy(true); setError(''); setLink(null);
    try { const result = await task(); if (result?.url) setLink(result); await refresh(); if (sessionId) setStudents(await adminApi(`/sessions/${sessionId}/students`)); setSelected([]); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <><h1>Evaluator invitations</h1><p>One private link per evaluator. Each link can be activated once and access ends 24 hours after creation.</p>
    {error && <p role="alert" className="notice">{error}</p>}
    {link && <section className="panel access-card"><h2>Invitation created</h2><p>Expires {deadline(link.expiresAt)}. Copy this link now; it is only shown once.</p><input aria-label="Invitation link" readOnly value={link.url} onFocus={(e) => e.target.select()} style={{ width: '100%' }} /><button className="button secondary" onClick={() => navigator.clipboard.writeText(link.url).catch(() => setError('Select and copy the link manually.'))}>Copy link</button></section>}
    <form className="panel access-card" onSubmit={(e) => { e.preventDefault(); perform(() => adminApi('/invitations', { method: 'POST', body: { ...form, sessionId, studentIds: selected } })); }}>
      <h2>Invite evaluator</h2><div className="access-grid"><div>
        {Object.entries({ name: 'Full name', email: 'Email', organisation: 'Organisation (optional)', title: 'Role or title (optional)' }).map(([key, label]) => <label className="access-field" key={key}>{label}<input type={key === 'email' ? 'email' : 'text'} maxLength={key === 'email' ? 254 : 120} required={['name', 'email'].includes(key)} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
        <label className="access-field">Session<select required value={sessionId} onChange={(e) => { setSessionId(e.target.value); setSelected([]); setStudents([]); }}><option value="">Choose a session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.program_title} — {s.title}</option>)}</select></label>
      </div><div><h3>Confirmed students</h3><p>Students already assigned require a replacement link through their existing invitation.</p>
        <button type="button" className="button secondary" onClick={() => setSelected(students.filter((s) => !s.sheet_id).map((s) => s.id))}>Select all unassigned</button>
        {students.map((s) => <label key={s.id} className="access-check"><input type="checkbox" disabled={Boolean(s.sheet_id)} checked={selected.includes(s.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, s.id] : selected.filter((id) => id !== s.id))} />{s.full_name} {s.sheet_id ? '(assigned)' : ''}</label>)}
        {!students.length && <p>No confirmed students in this session.</p>}
      </div></div><button className="button" disabled={busy || !selected.length}>Generate 24-hour link</button>
    </form>
    <h2>Issued invitations</h2>{invitations.map((i) => <article className="panel access-card" key={i.id}><h3>{i.evaluator_name}</h3><p>{i.evaluator_email} · {i.session_title} · {i.assigned_count} assigned</p><p>{String(i.status || 'AWAITING_ACTIVATION').replaceAll('_', ' ').toLowerCase()} · Expires {deadline(i.expires_at)}</p><div className="access-actions">
      {!i.revoked_at && <button className="button secondary" disabled={busy} onClick={() => window.confirm('Revoke this evaluator’s access now? Saved work will remain.') && perform(() => adminApi(`/invitations/${i.id}/revoke`, { method: 'POST' }))}>Revoke</button>}
      {Number(i.assigned_count) > 0 && <button className="button secondary" disabled={busy} onClick={() => window.confirm('Replace this link? The previous link and browser session will stop working.') && perform(() => adminApi(`/invitations/${i.id}/replace`, { method: 'POST' }))}>Issue replacement</button>}
    </div></article>)}</>;
}

export function AdminReviewQueue() {
  const [rows, setRows] = useState([]); const [sessions, setSessions] = useState([]); const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(''); const [filter, setFilter] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const load = useCallback(() => Promise.all([adminApi('/reviews').then(setRows), adminApi('/sessions').then(setSessions)]), []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  const visible = rows.filter((r) => (!sessionId || r.session_id === sessionId) && `${r.full_name} ${r.evaluator_name} ${r.state}`.toLowerCase().includes(filter.toLowerCase()));
  async function release() {
    if (!window.confirm('Release all approved reports for this session? Students will be notified. Incomplete reports block release.')) return;
    setBusy(true); setError(''); setNotice('');
    try { const result = await adminApi(`/sessions/${sessionId}/release`, { method: 'POST' }); setNotice(result.released ? `${result.released} reports released.` : 'No new approved reports to release.'); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function exclude(row) {
    const reason = window.prompt('Why is this student excluded (for example, absent)?'); if (!reason?.trim()) return;
    setBusy(true); try { await adminApi(`/sheets/${row.id}/exclude`, { method: 'POST', body: { reason } }); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <><h1>Evaluation review</h1><p>Review the submitted version, approve it, then release the session’s reports.</p><Link className="button secondary" to="/admin/evaluator-invitations">Manage evaluator access</Link>
    <div className="filter-bar"><label>Session<select value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">All sessions</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.program_title} — {s.title}</option>)}</select></label><label>Search student, evaluator or status<input value={filter} onChange={(e) => setFilter(e.target.value)} /></label></div>
    {error && <p role="alert" className="notice">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!visible.length && <p>No matching reports. Create an evaluator invitation to assign students.</p>}
    {visible.map((r) => <article key={r.id} className="panel access-card"><h2>{r.full_name}</h2><p>{r.session_title} · {r.evaluator_name} · {r.excluded_reason ? `Excluded: ${r.excluded_reason}` : String(r.state || 'DRAFT').replaceAll('_', ' ')}</p><div className="access-actions"><Link className="button secondary" to={`/admin/evaluations/${r.id}`}>Review report</Link>{!r.excluded_reason && r.state !== 'RELEASED' && <button disabled={busy} className="button secondary" onClick={() => exclude(r)}>Mark absent / exclude</button>}</div></article>)}
    <button className="button" disabled={busy || !sessionId} onClick={release}>{busy ? 'Working…' : 'Release approved session reports'}</button>
  </>;
}

export function AdminReviewDetail() {
  const { id } = useParams(); const [report, setReport] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [internalNote, setInternalNote] = useState(''); const [message, setMessage] = useState(''); const [preview, setPreview] = useState(false);
  const load = useCallback(() => adminApi(`/reviews/${id}`).then(setReport), [id]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  async function decide(decision) {
    setBusy(true); setError('');
    try { await adminApi(`/reviews/${id}`, { method: 'POST', body: { revisionId: report.revision.id, decision, internalNote, message } }); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const identity = report?.revision?.evaluator_snapshot;
  const content = report?.studentPreview;
  return <><Link to="/admin/evaluations">← Evaluation review</Link><h1>{report?.full_name || 'Report review'}</h1>{error && <p role="alert" className="notice">{error}</p>}
    {report && <><p>{report.program_title} · {report.session_title} · {report.state}</p>
      {!report.revision && <p>The evaluator has not submitted a report yet.</p>}
      {identity && !preview && <section className="access-private"><h2>Evaluator details — internal</h2><p>{identity.name} · {identity.email}</p><p>{identity.organisation} · {identity.title}</p><p>Submitted {deadline(report.revision.submitted_at)}</p></section>}
      {content && <section className="panel access-card"><h2>{preview ? 'Student report preview' : 'Submitted scores and feedback'}</h2><p>{content.programName} · {content.sessionName}</p><dl>{TEN_CRITERIA.map((c) => <div className="access-score" key={c.key}><dt>{c.label}</dt><dd>{content.scores[c.key]} / 100</dd></div>)}</dl><p><strong>Overall score: {Object.values(content.scores).reduce((a, b) => a + b, 0) / 10} / 100</strong></p><p style={{ whiteSpace: 'pre-wrap' }}>{content.feedback}</p><button className="button secondary" onClick={() => setPreview(!preview)}>{preview ? 'Back to internal review' : 'Preview student report'}</button></section>}
      {!preview && report.state === 'SUBMITTED' && <section className="panel access-card"><label className="access-field">Internal note (admins only)<textarea value={internalNote} maxLength="4000" onChange={(e) => setInternalNote(e.target.value)} /></label><label className="access-field">Changes requested (visible to evaluator)<textarea value={message} maxLength="2000" onChange={(e) => setMessage(e.target.value)} /></label><p>Check the student preview for any evaluator identity accidentally included in feedback.</p><div className="access-actions"><button disabled={busy} className="button" onClick={() => decide('APPROVED')}>Approve this revision</button><button disabled={busy || !message.trim()} className="button secondary" onClick={() => decide('CHANGES_REQUESTED')}>Request changes</button></div><p>If access has expired, issue a replacement invitation after requesting changes.</p></section>}
      {!preview && <section className="panel access-card"><h2>Review history — internal</h2>{(report.history || []).map((h) => <div key={h.id}><p>{h.evaluator_snapshot?.name || 'Evaluator'} · {deadline(h.submitted_at)} · {h.decision || 'Awaiting review'}</p><p>{h.internal_note}</p><p>{h.evaluator_message}</p></div>)}</section>}
    </>}
  </>;
}

export function AdminDelivery() {
  const [rows, setRows] = useState([]); const [error, setError] = useState('');
  useEffect(() => { adminApi('/delivery').then(setRows).catch((e) => setError(e.message)); }, []);
  return <><h1>Report notification delivery</h1>{error && <p role="alert">{error}</p>}{rows.map((r) => <section className="panel access-card" key={r.id}><p>{r.message}</p><p>{r.sent_at ? 'Sent' : r.attempts >= 5 ? 'Failed — contact operator' : 'Queued'} · Attempts: {r.attempts}</p>{r.last_error && <p>{r.last_error}</p>}</section>)}{!rows.length && <p>No report notifications queued yet.</p>}</>;
}
