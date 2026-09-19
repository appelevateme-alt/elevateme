import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Eyebrow, StickyActionBar } from '../../components/ui/Structure.jsx';
import { Alert, ConfirmDialog, Toast } from '../../components/ui/Feedback.jsx';
import { CriterionScoreInput } from '../../components/domain/Domain.jsx';
import { TEN_CRITERIA } from '../../lib/mock-data.js';
import { mockRegistrations, mockSessions } from '../../lib/mock-data.js';

const LEVELS = ['L', 'G', 'VG', 'E'];

export function LegacyEvaluate() {
  const [scores, setScores] = useState({});

  return (
    <div>
      <PageHeader title="Evaluation Form" description="Student Performance Sheet — ten criteria. Score meaning: baseline 50 + L/G/VG/E (numeric mapping TBC)." action={<Button variant="secondary">Save draft</Button>} />
      <Card title="Amaya Perera · EM-00100" meta="UNHRC — Committee A · Template v1 (versioned)">
        <div className="form-stack">
          {TEN_CRITERIA.map((c) => (
            <Field key={c.key} label={c.label} hint={c.help}>
              <Select value={scores[c.key] || ''} onChange={(e) => setScores((s) => ({ ...s, [c.key]: e.target.value }))} required>
                <option value="">Select level…</option>
                {LEVELS.map((l) => (<option key={l} value={l}>{l}</option>))}
              </Select>
            </Field>
          ))}
          <Field label="Evaluator remarks" hint="Shared with student and parent after release.">
            <textarea className="textarea" placeholder="Strengths, development areas…" />
          </Field>
          <Field label="Private admin note" hint="Staff-only. Never shown to student or parent.">
            <textarea className="textarea" style={{ minHeight: 80 }} placeholder="Optional…" />
          </Field>
          <div className="row">
            <Button>Submit sheet</Button>
            <Button variant="secondary">Save draft</Button>
          </div>
          <p className="em-meta">{Object.keys(scores).length}/10 criteria scored · submitted sheets lock; reopen is audited.</p>
        </div>
      </Card>
    </div>
  );
}

export function PerStudentEvaluate() {
  const { assignmentId, studentId } = useParams();
  const session = mockSessions.find((s) => s.id === assignmentId) || mockSessions[0];
  const roster = mockRegistrations;
  const idx = Math.max(0, roster.findIndex((r) => r.elevateMeId === studentId));
  const student = roster[idx] || roster[0];

  const [scores, setScores] = useState({});
  const [remarks, setRemarks] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [locked, setLocked] = useState(false);
  const [toast, setToast] = useState('');
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const warn = (e) => { if (dirty && !locked) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, locked]);

  const prev = roster[idx - 1];
  const next = roster[idx + 1];
  const scored = Object.keys(scores).length;

  const submit = () => {
    const missing = TEN_CRITERIA.filter((c) => !scores[c.key]).map((c) => c.label);
    if (missing.length > 0) {
      setErrors([`${missing.length} criteria unscored: ${missing.join(', ')}.`]);
      return;
    }
    setErrors([]);
    setConfirming(true);
  };

  return (
    <div>
      <Eyebrow>Evaluation · {session.title}</Eyebrow>
      <PageHeader title={`${student.studentName} · ${student.elevateMeId}`} description={`${session.title} · ${session.date} · Template v1 · ${student.evaluationState}`} />
      {locked ? (
        <Alert tone="success" title="Evaluation submitted and locked">
          This sheet is now <strong>Locked</strong>. Any reopen must be requested from an authorized coordinator or admin and is audited.
          <div className="row" style={{ marginTop: 8 }}>
            {next && <Link to={`/evaluator/assignments/${session.id}/students/${next.elevateMeId}`} className="btn">Next student →</Link>}
            <Link to={`/evaluator/assignments/${session.id}`} className="btn btn-ghost">Back to assignment</Link>
          </div>
        </Alert>
      ) : (
        <>
          <div className="sticky-context">
            <p style={{ margin: 0, fontSize: 14 }}><strong>{student.studentName}</strong> · {session.title} · {scored}/10 scored{dirty ? ' · unsaved changes' : ''}</p>
          </div>
          {errors.length > 0 && (
            <div role="alert" className="alert alert-danger">
              <ul className="list-plain">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          <Card title="Ten criteria" meta="Each row: criterion, one-line rubric, level selector">
            {TEN_CRITERIA.map((c) => (
              <CriterionScoreInput key={c.key} criterionKey={c.key} label={c.label} rubric={c.help} value={scores[c.key] || ''} onChange={(v) => { setScores((s) => ({ ...s, [c.key]: v })); setDirty(true); }} />
            ))}
            <div className="form-stack" style={{ marginTop: 16 }}>
              <Field label="Evaluator remarks" hint="Shared with student and parent after release.">
                <textarea className="textarea" value={remarks} onChange={(e) => { setRemarks(e.target.value); setDirty(true); }} placeholder="Strengths, development areas…" />
              </Field>
              <Field label="Private admin note (optional)" hint="Staff-only. Never shown to student or parent.">
                <textarea className="textarea" style={{ minHeight: 80 }} value={privateNote} onChange={(e) => { setPrivateNote(e.target.value); setDirty(true); }} placeholder="Optional…" />
              </Field>
            </div>
          </Card>
          <StickyActionBar>
            <Button variant="secondary" onClick={() => { setDirty(false); setToast('Draft saved — input preserved.'); }}>Save draft</Button>
            <Button onClick={submit}>Submit evaluation</Button>
            {prev && <Link to={`/evaluator/assignments/${session.id}/students/${prev.elevateMeId}`} className="btn btn-ghost">← Previous</Link>}
            {next && <Link to={`/evaluator/assignments/${session.id}/students/${next.elevateMeId}`} className="btn btn-ghost">Next →</Link>}
          </StickyActionBar>
        </>
      )}
      <ConfirmDialog
        open={confirming} title="Submit this evaluation?"
        body="Submitting locks the sheet. The student sees it only after admin release. Validation passed for all ten criteria."
        confirmLabel="Submit and lock"
        onConfirm={() => { setConfirming(false); setLocked(true); setDirty(false); setToast('Evaluation submitted and locked.'); }}
        onCancel={() => setConfirming(false)}
      />
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}
