import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, DataTable, Empty, Metrics, PageHead, Panel, Status } from '../components/ui.jsx';
import { ScoreInput } from '../components/domain.jsx';
import { SCORE_GUIDE, TEN_CRITERIA, mockRoster, mockSessions, total50 } from '../lib/mock-data.js';

/* ---------- Assigned sessions (prototype assignments) ---------- */
export function EvaluatorHome() {
  return (
    <div>
      <PageHead kicker="Evaluator workspace" title="Assigned sessions." desc="Open a session, select a student and complete the evaluation sheet." />
      <Metrics items={[
        ['Assigned sessions', '02', 'Across 2 programs'],
        ['Students', '34', '12 evaluated'],
        ['Drafts', '03', 'Saved on this device'],
        ['Due next', '30 SEP', 'Academic Speaking'],
      ]} />
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
    </div>
  );
}

/* ---------- Assignment → students (kept navigation, prototype styling) ---------- */
export function AssignmentPage() {
  const { assignmentId } = useParams();
  const session = mockSessions.find((s) => s.id === assignmentId) || mockSessions[1];
  const [q, setQ] = useState('');
  const students = mockRoster.filter((r) => !q || `${r.name} ${r.elevateMeId}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHead kicker="Assignment" title={`${session.title}.`} desc={`${session.topic} · ${session.date} · ${session.venue}`} />
      <div className="notice" style={{ marginBottom: 22 }}>
        <strong>Instructions.</strong> Score all ten criteria per student. Save drafts freely; submitting locks the sheet. Reopen is audited.
      </div>
      <div className="filter-bar">
        <input type="search" placeholder="Search students" aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {students.length === 0 ? (
        <Empty title="No matching students" body="Clear the search to see the full list." action={<Button variant="secondary" small onClick={() => setQ('')}>Clear search</Button>} />
      ) : (
        <DataTable headers={['Student', 'ElevateMe ID', 'Status', '']}
          rows={students.map((r, i) => [
            r.name, r.elevateMeId, <Status key="s" value={r.evaluation} />,
            <span key="n" style={{ display: 'flex', gap: 8 }}>
              <Link to={`/evaluator/assignments/${session.id}/students/${r.elevateMeId}`} className="button secondary small">Evaluate</Link>
              {students[i + 1] && <Link to={`/evaluator/assignments/${session.id}/students/${students[i + 1].elevateMeId}`} className="button quiet small">Next →</Link>}
            </span>,
          ])} />
      )}
    </div>
  );
}

/* ---------- Per-student sheet, 50+ model (kept flow) ---------- */
export function PerStudentEvaluate() {
  const { assignmentId, studentId } = useParams();
  const session = mockSessions.find((s) => s.id === assignmentId) || mockSessions[1];
  const roster = mockRoster;
  const idx = Math.max(0, roster.findIndex((r) => r.elevateMeId === studentId));
  const student = roster[idx] || roster[0];

  const [scores, setScores] = useState({});
  const [remarks, setRemarks] = useState('Strong structure and clear opening. The main development area is responding to counter-arguments without losing focus.');
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const warn = (e) => { if (dirty && !locked) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, locked]);

  const prev = roster[idx - 1];
  const next = roster[idx + 1];

  return (
    <div>
      <PageHead kicker="Student performance sheet" title={`Evaluate ${student.name}.`} desc={`${session.title} · ${session.date} · ${student.elevateMeId}`}
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
          <div className="sticky-context"><strong>{student.name}</strong> · {session.title} · {Object.keys(scores).length}/10 scored{Object.keys(scores).length === 10 ? ` · 50 + ${total50(scores).added} = ${total50(scores).total}` : ''}{dirty ? ' · unsaved changes' : ''}</div>
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
              <Button variant="secondary" onClick={() => setDirty(false)}>Save draft</Button>
              <Button onClick={() => {
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
              <Button onClick={() => { setConfirming(false); setLocked(true); setDirty(false); }}>Submit and lock</Button>
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

/* ---------- Submissions (prototype) ---------- */
export function EvaluatorSubmissions() {
  return (
    <div>
      <PageHead kicker="Evaluator workspace" title="Your submissions." desc="Review completed sheets and continue saved drafts." />
      <div className="filter-bar">
        <select aria-label="Assignment"><option>All assignments</option><option>Academic Speaking</option><option>Colombo Youth MUN</option></select>
        <select aria-label="Status"><option>All statuses</option><option>Submitted</option><option>Draft</option></select>
      </div>
      <DataTable headers={['Student', 'ElevateMe ID', 'Session', 'Updated', 'Status']}
        rows={mockRoster.map((r, i) => [
          <strong key="n">{r.name}</strong>, r.elevateMeId, 'Academic Speaking · 06', `${18 - i} Sep 2026`,
          <Status key="s" value={i < 3 ? 'Submitted' : 'Draft'} />,
        ])} />
    </div>
  );
}

export function EvaluatorStudents() {
  return (
    <div>
      <PageHead kicker="Evaluator workspace" title="Student list." desc="Only students in your assigned sessions." />
      <Panel title="Assigned students" action={<span className="tag">One state per student-session</span>}>
        <DataTable headers={['Student', 'ElevateMe ID', 'Allocation', 'State']}
          rows={mockRoster.map((s) => [s.name, s.elevateMeId, s.allocation, <Status key={s.id} value={s.evaluation} />])} />
      </Panel>
    </div>
  );
}
