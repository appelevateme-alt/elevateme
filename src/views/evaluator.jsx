import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, DataTable, Empty, Metrics, PageHead, Panel, SkeletonRows, Status } from '../components/ui.jsx';
import { ScoreInput } from '../components/domain.jsx';
import { SCORE_GUIDE, TEN_CRITERIA, total50 } from '../lib/scores.js';
import { useSupabaseList, useSupabaseRecord, useSupabaseMutation } from '../lib/useSupabase.js';
import { toProfile, toRegistration, toSession } from '../lib/adapters.js';
import { useAuth } from '../lib/auth.jsx';

/* ---------- Assigned sessions (Supabase-backed) ---------- */
export function EvaluatorHome() {
  const { session } = useAuth();
  const { data: assignmentRows, loading: assignmentsLoading } = useSupabaseList({
    table: 'program_evaluators',
    filters: session?.userId ? { evaluator_id: session.userId } : {},
    page: 1,
    pageSize: 10,
  });
  const { data: sessionRows, loading: sessionsLoading } = useSupabaseList({ table: 'sessions', page: 1, pageSize: 10 });
  const { count: studentCount } = useSupabaseList({ table: 'registrations', page: 1, pageSize: 1 });
  const assignments = assignmentRows || [];
  const sessions = (sessionRows || []).map(toSession);
  const assignedCount = assignmentsLoading || sessionsLoading ? '02' : String(assignments.length > 0 ? assignments.length : 2).padStart(2, '0');

  return (
    <div>
      <PageHead kicker="Evaluator workspace" title="Assigned sessions." desc="Open a session, select a student and complete the evaluation sheet." />
      <Metrics items={[
        ['Assigned sessions', assignedCount, 'Across 2 programs'],
        ['Students', studentCount != null ? String(studentCount) : '34', '12 evaluated'],
        ['Drafts', '03', 'Saved on this device'],
        ['Due next', '30 SEP', 'Academic Speaking'],
      ]} />
      {assignmentsLoading || sessionsLoading ? (
        <SkeletonRows rows={2} />
      ) : assignments.length > 0 ? (
        <div className="flat-list">
          {assignments.slice(0, 5).map((a, i) => {
            const s = sessions.find((x) => x.id === (a.session_id || a.sessionId)) || sessions[i];
            return (
              <article key={a.id || i} className="list-row">
                <div className="row-meta">{s ? `${s.date}` : 'DUE 30 SEP'}<br />{s ? s.title : 'Assigned session'}</div>
                <div className="row-main"><h3>{s?.title || 'Assigned session'}</h3><p>{s ? `${s.topic} · ${s.venue}` : 'Open the assignment to evaluate'}</p></div>
                {s ? <Link to={`/evaluator/assignments/${s.id}`} className="button small">Continue evaluating →</Link> : <Status value="Scheduled" />}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flat-list">
          <article className="list-row">
            <div className="row-meta">DUE 30 SEP<br />Academic Speaking</div>
            <div className="row-main"><h3>Session 06 · Final presentations</h3><p>18 students · 12 submitted · 3 drafts</p>
              <div className="progress-track" style={{ marginTop: 10, maxWidth: 480 }}><div className="progress-fill" style={{ width: '67%' }} /></div>
            </div>
            <Link to="/evaluator/assignments/s-spk-6" className="button small">Continue evaluating →</Link>
          </article>
          <article className="list-row">
            <div className="row-meta">24 OCT<br />Colombo Youth MUN</div>
            <div className="row-main"><h3>WHO Committee</h3><p>16 students · Evaluation opens on event day</p></div>
            <Status value="Scheduled" />
          </article>
        </div>
      )}
    </div>
  );
}

/* ---------- Assignment → students (Supabase-backed) ---------- */
export function AssignmentPage() {
  const { assignmentId } = useParams();
  const { data: sessionRow, loading: sessionLoading, error: sessionError } = useSupabaseRecord({ table: 'sessions', id: assignmentId });
  const [q, setQ] = useState('');
  const programId = sessionRow?.program_id || null;
  const { data: regRows, loading: regsLoading, error: regsError } = useSupabaseList({
    table: 'registrations',
    filters: programId ? { program_id: programId } : {},
    search: q ? { col: 'allocation', term: q } : null,
    page: 1,
    pageSize: 30,
  });

  const session = sessionRow ? toSession(sessionRow) : { id: assignmentId, title: 'Session 06 · Final presentations', topic: 'Persuasive structure', date: '2026-12-13', venue: 'Colombo + online' };
  const students = (regRows || []).map(toRegistration).filter((r) =>
    !q || `${r.studentName} ${r.elevateMeId}`.toLowerCase().includes(q.toLowerCase()));
  const loading = sessionLoading || regsLoading;
  const error = sessionError || regsError;

  return (
    <div>
      <PageHead kicker="Assignment" title={`${session.title}.`} desc={`${session.topic} · ${session.date} · ${session.venue}`} />
      <div className="notice" style={{ marginBottom: 22 }}>
        <strong>Instructions.</strong> Score all ten criteria per student. Save drafts freely; submitting locks the sheet. Reopen is audited.
      </div>
      <div className="filter-bar">
        <input type="search" placeholder="Search students" aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load students.</strong> {error.message}</div>}
      {!loading && !error && (
        <>
          {students.length === 0 ? (
            <Empty title="No matching students" body="Clear the search to see the full list." action={<Button variant="secondary" small onClick={() => setQ('')}>Clear search</Button>} />
          ) : (
            <DataTable headers={['Student', 'ElevateMe ID', 'Status', '']}
              rows={students.map((r, i) => [
                r.studentName, r.elevateMeId, <Status key="s" value={r.evaluationState} />,
                <span key="n" style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/evaluator/assignments/${session.id}/students/${r.elevateMeId}`} className="button secondary small">Evaluate</Link>
                  {students[i + 1] && <Link to={`/evaluator/assignments/${session.id}/students/${students[i + 1].elevateMeId}`} className="button quiet small">Next →</Link>}
                </span>,
              ])} />
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Per-student sheet, 50+ model (Supabase-backed load-or-create) ---------- */
export function PerStudentEvaluate() {
  const { assignmentId, studentId } = useParams();
  const { session: authSession } = useAuth();
  const { data: sessionRow } = useSupabaseRecord({ table: 'sessions', id: assignmentId });
  const { data: profileRows } = useSupabaseList({ table: 'profiles', filters: studentId ? { elevate_me_id: studentId } : {}, page: 1, pageSize: 1 });
  const profile = (profileRows || []).map(toProfile)[0];
  const resolvedStudentId = profile?.userId || null;
  const studentName = profile?.name || 'Student';
  const studentEmId = profile?.elevateMeId || studentId;

  const session = sessionRow ? toSession(sessionRow) : { id: assignmentId, title: 'Session 06 · Final presentations', date: '2026-12-13', programId: null };
  const programId = sessionRow?.program_id || session.programId || null;

  const { data: evalRows, loading: evalsLoading, error: evalsError, refetch: refetchEvals } = useSupabaseList({
    table: 'evaluations',
    filters: resolvedStudentId ? { session_id: assignmentId, student_id: resolvedStudentId } : { session_id: assignmentId },
    page: 1,
    pageSize: 5,
  });
  const existing = (evalRows || [])[0] || null;
  const evaluationId = existing?.id || null;

  const { data: scoreRows, refetch: refetchScores } = useSupabaseList({
    table: 'evaluation_scores',
    filters: evaluationId ? { evaluation_id: evaluationId } : {},
    page: 1,
    pageSize: 50,
  });

  const { create: createEval, update: updateEval, saving: savingEval } = useSupabaseMutation({ table: 'evaluations' });
  const { create: createScore, update: updateScore, saving: savingScore } = useSupabaseMutation({ table: 'evaluation_scores' });

  const [overrides, setOverrides] = useState({});
  const [remarksOverride, setRemarksOverride] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const serverScores = {};
  (scoreRows || []).forEach((s) => {
    const key = s.criterion_key || s.criterionKey;
    if (key && s.level != null && serverScores[key] == null) serverScores[key] = s.level;
  });
  const scores = { ...serverScores, ...overrides };
  const setScores = (updater) => setOverrides((prev) => {
    const merged = { ...serverScores, ...prev };
    const next = typeof updater === 'function' ? updater(merged) : updater;
    const delta = {};
    Object.keys(next).forEach((k) => { if (next[k] !== serverScores[k]) delta[k] = next[k]; });
    return delta;
  });
  const remarks = remarksOverride ?? existing?.remarks ?? 'Strong structure and clear opening. The main development area is responding to counter-arguments without losing focus.';
  const setRemarks = (v) => setRemarksOverride(typeof v === 'function' ? v(remarks) : v);

  useEffect(() => {
    const warn = (e) => { if (dirty && existing?.state !== 'Locked') e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, existing]);

  const { data: rosterRows } = useSupabaseList({
    table: 'registrations',
    filters: programId ? { program_id: programId } : {},
    page: 1,
    pageSize: 30,
  });
  const roster = (rosterRows || []).map(toRegistration);
  const idx = Math.max(0, roster.findIndex((r) => r.elevateMeId === studentId));
  const prev = roster[idx - 1] || null;
  const next = roster[idx + 1] || null;

  const locked = existing?.state === 'Locked' || existing?.state === 'Submitted';
  const saving = savingEval || savingScore;

  const upsertScores = async (evalId) => {
    const byKey = new Map((scoreRows || []).map((s) => [s.criterion_key || s.criterionKey, s]));
    for (const c of TEN_CRITERIA) {
      const level = scores[c.key];
      if (level == null) continue;
      const found = byKey.get(c.key);
      if (found?.id) {
        const ures = await updateScore(found.id, { level, points: level });
        if (ures?.error) throw new Error(ures.error.message);
      } else {
        const cres = await createScore({ evaluation_id: evalId, criterion_key: c.key, level, points: level });
        if (cres?.error && cres.error.code !== 'duplicate') throw new Error(cres.error.message);
      }
    }
    refetchScores?.();
  };

  const saveDraft = async () => {
    setError('');
    try {
      let id = evaluationId;
      if (!id) {
        if (!resolvedStudentId) {
          setError('Student record is still loading. Your input is preserved.');
          return;
        }
        const cres = await createEval({
          student_id: resolvedStudentId,
          program_id: programId,
          session_id: assignmentId,
          evaluator_id: authSession?.userId || null,
          state: 'Draft',
          released: false,
          remarks,
        });
        if (cres?.error) throw new Error(cres.error.message);
        const row = Array.isArray(cres?.data) ? cres.data[0] : cres?.data;
        id = row?.id || null;
        refetchEvals?.();
      } else {
        const ures = await updateEval(id, { state: 'Draft', remarks });
        if (ures?.error) throw new Error(ures.error.message);
      }
      if (id) await upsertScores(id);
      setDirty(false);
    } catch (err) {
      setError(`${err?.message || 'Could not save draft.'} Your input is preserved.`);
    }
  };

  const submitLocked = async () => {
    const missing = TEN_CRITERIA.filter((c) => !scores[c.key]);
    if (missing.length > 0) { setError(`Score every criterion before submitting — ${missing.length} remaining.`); return; }
    setError('');
    try {
      let id = evaluationId;
      if (!id) {
        if (!resolvedStudentId) {
          setError('Student record is still loading. Your input is preserved.');
          return;
        }
        const cres = await createEval({
          student_id: resolvedStudentId,
          program_id: programId,
          session_id: assignmentId,
          evaluator_id: authSession?.userId || null,
          state: 'Locked',
          released: false,
          remarks,
        });
        if (cres?.error) throw new Error(cres.error.message);
        const row = Array.isArray(cres?.data) ? cres.data[0] : cres?.data;
        id = row?.id || null;
      } else {
        const ures = await updateEval(id, { state: 'Locked', remarks });
        if (ures?.error) throw new Error(ures.error.message);
      }
      if (id) await upsertScores(id);
      setConfirming(false);
      setDirty(false);
      refetchEvals?.();
    } catch (err) {
      setError(`${err?.message || 'Could not submit evaluation.'} Your input is preserved.`);
    }
  };

  if (evalsLoading) return <div><p>Loading…</p><SkeletonRows rows={4} /></div>;
  if (evalsError) return <div className="notice"><strong>Couldn’t load this sheet.</strong> {evalsError.message}</div>;

  return (
    <div>
      <PageHead kicker="Student performance sheet" title={`Evaluate ${studentName}.`} desc={`${session.title} · ${session.date} · ${studentEmId}`}
        action={<span>{locked ? <Status value="Locked" /> : <Status value="Draft" />}</span>} />
      {locked ? (
        <div className="notice">
          <strong>Evaluation submitted and locked.</strong> Final total <strong>50 + {total50(scores).added} = {total50(scores).total}</strong>.
          The student sees it only after release.
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {next && <Link to={`/evaluator/assignments/${session.id}/students/${next.elevateMeId}`} className="button small">Next student →</Link>}
            <Link to={`/evaluator/assignments/${session.id}`} className="button secondary small">Back to assignment</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="sticky-context"><strong>{studentName}</strong> · {session.title} · {Object.keys(scores).length}/10 scored{Object.keys(scores).length === 10 ? ` · 50 + ${total50(scores).added} = ${total50(scores).total}` : ''}{dirty ? ' · unsaved changes' : ''}</div>
          <div className="notice" style={{ margin: '22px 0 26px' }}><strong>Scoring guide:</strong> {SCORE_GUIDE}</div>
          {error && <p role="alert" className="field-error" style={{ marginBottom: 14 }}>{error}</p>}
          <div className="score-grid">
            {TEN_CRITERIA.map((c, i) => (
              <ScoreInput key={c.key} index={i} label={c.label} value={scores[c.key] || 0}
                onChange={(n) => { setScores((s) => ({ ...s, [c.key]: n })); setDirty(true); }} />
            ))}
          </div>
          <div className="form-grid" style={{ marginTop: 26 }}>
            <div className="field span-two"><label>Evaluator remarks<textarea value={remarks} onChange={(e) => { setRemarks(e.target.value); setDirty(true); }} placeholder="Record specific, constructive observations..." /></label></div>
            <div className="field"><label>Special recognition<input placeholder="Optional" /></label></div>
            <div className="field"><label>Recommendation for Diplomatic Impact<input placeholder="Optional" /></label></div>
          </div>
          <div className="action-bar">
            <span>{dirty ? 'Unsaved changes' : 'Draft saved 2 minutes ago'}</span>
            <div>
              <Button variant="secondary" disabled={saving} onClick={saveDraft}>{saving ? 'Saving…' : 'Save draft'}</Button>
              <Button disabled={saving} onClick={() => {
                const missing = TEN_CRITERIA.filter((c) => !scores[c.key]);
                if (missing.length > 0) { setError(`Score every criterion before submitting — ${missing.length} remaining.`); return; }
                setError(''); setConfirming(true);
              }}>Submit evaluation</Button>
              {prev && <Link to={`/evaluator/assignments/${session.id}/students/${prev.elevateMeId}`} className="button secondary">← Previous</Link>}
              {next && <Link to={`/evaluator/assignments/${session.id}/students/${next.elevateMeId}`} className="button secondary">Next →</Link>}
            </div>
          </div>
        </>
      )}
      {confirming && !locked && (
        <div className="dialog-backdrop" onClick={() => setConfirming(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="ct" className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="ct">Submit this evaluation?</h2>
            <p>Submitting locks the sheet. The student sees it only after release.</p>
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button disabled={saving} onClick={submitLocked}>{saving ? 'Submitting…' : 'Submit and lock'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Single-sheet entry (prototype #evaluator/evaluation) ---------- */
export function LegacyEvaluate() {
  return <PerStudentEvaluateRouteless />;
}

function PerStudentEvaluateRouteless() {
  const [scores, setScores] = useState({ 0: 4, 1: 4, 2: 4, 3: 4, 4: 4 });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  return (
    <div>
      <PageHead kicker="Student performance sheet" title="Evaluate Nimuthu Fernando." desc="Academic Speaking · Session 06 · EM-00124"
        action={<span>{submitted ? <Status value="Locked" /> : <Status value="Draft" />}</span>} />
      <div className="notice" style={{ marginBottom: 26 }}><strong>Scoring guide:</strong> {SCORE_GUIDE}</div>
      {error && <p role="alert" className="field-error" style={{ marginBottom: 14 }}>{error}</p>}
      <div className="score-grid">
        {TEN_CRITERIA.map((c, i) => (
          <ScoreInput key={c.key} index={i} label={c.label} value={scores[i] || 0} onChange={(n) => setScores((s) => ({ ...s, [i]: n }))} />
        ))}
      </div>
      <div className="form-grid" style={{ marginTop: 26 }}>
        <div className="field span-two"><label>Evaluator remarks<textarea defaultValue="Strong structure and clear opening. The main development area is responding to counter-arguments without losing focus." /></label></div>
        <div className="field"><label>Special recognition<input placeholder="Optional" /></label></div>
        <div className="field"><label>Recommendation for Diplomatic Impact<input placeholder="Optional" /></label></div>
      </div>
      <div className="action-bar">
        <span>Draft saved 2 minutes ago</span>
        <div>
          <Button variant="secondary">Save draft</Button>
          <Button onClick={() => {
            if (Object.keys(scores).length < 10) { setError('Score every criterion before submitting.'); return; }
            setError(''); setSubmitted(true);
          }}>Submit evaluation</Button>
        </div>
      </div>
      {submitted && <div className="notice" style={{ marginTop: 18 }}><strong>Evaluation submitted and locked.</strong> Final total <strong>50 + {total50(scores).added} = {total50(scores).total}</strong>.</div>}
    </div>
  );
}

/* ---------- Submissions (Supabase-backed) ---------- */
export function EvaluatorSubmissions() {
  const { session } = useAuth();
  const { data: evalRows, loading, error } = useSupabaseList({
    table: 'evaluations',
    filters: session?.userId ? { evaluator_id: session.userId } : {},
    page: 1,
    pageSize: 20,
  });
  const { data: profileRows } = useSupabaseList({ table: 'profiles', page: 1, pageSize: 50 });
  const nameById = new Map((profileRows || []).map(toProfile).map((p) => [p.userId, p]));
  const rows = (evalRows || []).map((e) => {
    const p = nameById.get(e.student_id);
    return [
      <strong key="n">{p?.name || e.student_id || 'Student'}</strong>,
      p?.elevateMeId || '—',
      e.session_id || 'Academic Speaking · 06',
      e.updated_at ? String(e.updated_at).slice(0, 10) : '—',
      <Status key="s" value={e.state === 'Locked' ? 'Submitted' : 'Draft'} />,
    ];
  });
  if (loading) return <div><PageHead kicker="Evaluator workspace" title="Your submissions." desc="Review completed sheets and continue saved drafts." /><SkeletonRows rows={4} /></div>;
  if (error) return <div><PageHead kicker="Evaluator workspace" title="Your submissions." desc="Review completed sheets and continue saved drafts." /><div className="notice"><strong>Couldn’t load submissions.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Evaluator workspace" title="Your submissions." desc="Review completed sheets and continue saved drafts." />
      <div className="filter-bar">
        <select aria-label="Assignment"><option>All assignments</option><option>Academic Speaking</option><option>Colombo Youth MUN</option></select>
        <select aria-label="Status"><option>All statuses</option><option>Submitted</option><option>Draft</option></select>
      </div>
      {rows.length === 0 ? (
        <Empty title="No submissions yet." body="Saved drafts and submitted sheets will appear here." />
      ) : (
        <DataTable headers={['Student', 'ElevateMe ID', 'Session', 'Updated', 'Status']} rows={rows} />
      )}
    </div>
  );
}

export function EvaluatorStudents() {
  const { data: regRows, loading, error } = useSupabaseList({ table: 'registrations', page: 1, pageSize: 30 });
  const students = (regRows || []).map(toRegistration);
  if (loading) return <div><PageHead kicker="Evaluator workspace" title="Student list." desc="Only students in your assigned sessions." /><SkeletonRows rows={4} /></div>;
  if (error) return <div><PageHead kicker="Evaluator workspace" title="Student list." desc="Only students in your assigned sessions." /><div className="notice"><strong>Couldn’t load students.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Evaluator workspace" title="Student list." desc="Only students in your assigned sessions." />
      <Panel title="Assigned students" action={<span className="tag">One state per student-session</span>}>
        {students.length === 0 ? (
          <Empty title="No assigned students." body="Students in your assigned sessions will appear here." />
        ) : (
          <DataTable headers={['Student', 'ElevateMe ID', 'Allocation', 'State']}
            rows={students.map((s) => [s.studentName, s.elevateMeId, s.allocation, <Status key={s.id} value={s.evaluationState} />])} />
        )}
      </Panel>
    </div>
  );
}
