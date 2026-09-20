import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, DataTable, Empty, ErrorSummary, Metrics, PageHead, Panel, Progress, SkeletonRows, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList, LineChart, Tabs } from '../components/domain.jsx';
import { useSupabaseList, useSupabaseRecord, useSupabaseMutation } from '../lib/useSupabase.js';
import { supabase } from '../lib/supabaseClient.js';
import { toEvaluation, toProfile, toProgram, toRegistration, toSession } from '../lib/adapters.js';
import { useAuth } from '../lib/auth.jsx';

/* ---------- Coordinator overview (prototype) ---------- */
export function CoordinatorDashboard() {
  const { data: progRows, count: progCount, loading: progsLoading } = useSupabaseList({ table: 'programs', page: 1, pageSize: 3 });
  const { count: regCount } = useSupabaseList({ table: 'registrations', page: 1, pageSize: 1 });
  const { count: evalCount } = useSupabaseList({ table: 'evaluations', filters: { released: false }, page: 1, pageSize: 1 });
  const programs = (progRows || []).map(toProgram);
  const changesNeeded = programs.filter((p) => p.status === 'ChangesRequested').length;
  const fullest = programs
    .filter((p) => (p.capacity ?? 0) > 0)
    .map((p) => ({ p, pct: Math.round(((p.registered ?? 0) / p.capacity) * 100) }))
    .sort((a, b) => b.pct - a.pct)[0];

  return (
    <div>
      <PageHead kicker="Coordinator overview" title="Programs at a glance." desc="Monitor registration, session readiness and evaluation completion."
        action={<Link to="/coordinator/programs" className="button">Create program →</Link>} />
      <Metrics items={[
        ['Active programs', progsLoading ? '00' : String(progCount ?? programs.length).padStart(2, '0'), changesNeeded > 0 ? `${changesNeeded} need changes` : 'Across your programs'],
        ['Registered students', String(regCount).padStart(2, '0'), 'Across all programs'],
        ['Evaluations due', String(evalCount).padStart(2, '0'), 'Unreleased sheets'],
        ['Average total', '—', 'No released evaluations yet'],
      ]} />
      <div className="grid dashboard">
        <section className="panel">
          <div className="panel-head"><h2>Program status</h2><Link to="/coordinator/programs" className="button quiet small">Manage all →</Link></div>
          <div className="panel-body">
            <div className="flat-list">
              {programs.slice(0, 3).map((p) => (
                <div key={p.id} className="list-row compact">
                  <div className="row-meta">{p.date}</div>
                  <div className="row-main"><h3>{p.title}</h3><p>{p.meta}</p></div>
                  <Status value={p.status === 'UnderReview' ? 'Pending review' : p.status} />
                </div>
              ))}
              {programs.length === 0 && !progsLoading && <p style={{ color: 'var(--muted)' }}>No programs yet. Create your first draft.</p>}
              {progsLoading && <p>Loading…</p>}
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Needs attention</h2><span className="nav-count">{String((evalCount > 0 ? 1 : 0) + (changesNeeded > 0 ? 1 : 0) + (fullest && fullest.pct >= 88 ? 1 : 0)).padStart(2, '0')}</span></div>
          <div className="panel-body">
            {(evalCount > 0 || changesNeeded > 0 || (fullest && fullest.pct >= 88)) ? (
              <InsightList items={[
                ...(evalCount > 0 ? [{ label: 'Evaluation', text: `${evalCount} evaluations are still unreleased.` }] : []),
                ...(changesNeeded > 0 ? [{ label: 'Approval', text: `${changesNeeded} program${changesNeeded === 1 ? '' : 's'} need${changesNeeded === 1 ? 's' : ''} your changes.`, small: 'Admin note received' }] : []),
                ...(fullest && fullest.pct >= 88 ? [{ label: 'Capacity', text: `${fullest.p.title} is ${fullest.pct}% full.`, small: 'Registration nearly full' }] : []),
              ]} />
            ) : (
              <Empty title="Nothing needs attention." body="Evaluations due, change requests, and nearly-full programs will appear here." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Programme management (Supabase-backed + kept builder) ---------- */
export function CoordinatorPrograms() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ title: '', type: 'Single Event', start: '', capacity: '30', desc: '' });
  const [formError, setFormError] = useState('');

  const { data, loading, error, refetch } = useSupabaseList({
    table: 'programs',
    search: q ? { col: 'title', term: q } : null,
    filters: status === 'All statuses' ? {} : { status },
    order: { col: 'start_date', ascending: true },
    page: 1,
    pageSize: 20,
  });
  const { create, saving } = useSupabaseMutation({ table: 'programs' });
  const rows = (data || []).map(toProgram);

  return (
    <div>
      <PageHead kicker="Programme management" title="Your programs." desc="Create events, manage their structure and submit them to Diplomatic Impact for approval."
        action={<div style={{ display: 'flex', gap: 10 }}><Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'Quick create →'}</Button><Link to="/coordinator/programs/new" className="button secondary">Guided builder →</Link></div>} />
      {showForm && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head"><h2>Create a program</h2><button className="icon-button" aria-label="Close" onClick={() => setShowForm(false)}>✕</button></div>
          <div className="panel-body form-grid">
            <div className="field"><label>Program title<input placeholder="e.g. Youth Leadership Forum" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label></div>
            <div className="field"><label>Program type<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option>Single Event</option><option>Continuous Programme</option><option>Special Programme</option></select></label></div>
            <div className="field"><label>Start date<input type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label></div>
            <div className="field"><label>Capacity<input type="number" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} /></label></div>
            <div className="field span-two"><label>Description<textarea placeholder="Describe the experience and expected outcomes" value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} /></label></div>
            {formError && <p role="alert" className="field-error span-two">{formError}</p>}
            <div className="span-two"><Button disabled={saving} onClick={async () => {
              setFormError('');
              if (!draft.title.trim()) { setFormError('Enter a program title. Your input is preserved.'); return; }
              try {
                const res = await create({
                  title: draft.title.trim(),
                  category: draft.type,
                  start_date: draft.start || null,
                  capacity: Number(draft.capacity) || 30,
                  description: draft.desc,
                  status: 'Draft',
                });
                if (res?.error) throw new Error(res.error.message);
                setShowForm(false);
                setDraft({ title: '', type: 'Single Event', start: '', capacity: '30', desc: '' });
                refetch?.();
              } catch (err) {
                setFormError(`${err?.message || 'Could not save draft.'} Your input is preserved.`);
              }
            }}>{saving ? 'Saving…' : 'Save draft'}</Button></div>
          </div>
        </section>
      )}
      <div className="filter-bar">
        <input type="search" placeholder="Search your programs" aria-label="Search your programs" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>All statuses</option><option>Published</option><option>InProgress</option><option>UnderReview</option>
        </select>
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load programs.</strong> {error.message}</div>}
      {!loading && !error && (
        <DataTable headers={['Program', 'Type', 'Date', 'Students', 'Status', '']}
          rows={rows.map((p) => [
            <strong key="t">{p.title}</strong>, p.typeLabel, `${p.date} 2026`, `${p.registered} / ${p.capacity}`,
            <Status key="s" value={p.status} />,
            <Link key="m" to={`/coordinator/programs/${p.id}`} className="button secondary small">Manage</Link>,
          ])} caption="Managed programs" />
      )}
    </div>
  );
}

/* ---------- Guided 6-step builder (Supabase-backed) ---------- */
const STEPS = ['Basics', 'Schedule and location', 'Program structure', 'Registration rules', 'Media and description', 'Review and submit'];

export function NewProgram() {
  const { session } = useAuth();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('SingleEvent');
  const [eventType, setEventType] = useState('ModelUN');
  const [venue, setVenue] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [capacity, setCapacity] = useState('60');
  const [structure, setStructure] = useState('WHO Committee · UNHCR · UNSC');
  const [description, setDescription] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState([]);
  const [programId, setProgramId] = useState(null);
  const { create: createProgram, update: updateProgram, saving: savingProgram } = useSupabaseMutation({ table: 'programs' });
  const { create: createSession } = useSupabaseMutation({ table: 'sessions' });
  const touch = () => setDirty(true);

  useEffect(() => {
    const warn = (e) => { if (dirty && !submitted) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, submitted]);

  const validate = (s) => {
    if (s === 1 && !title.trim()) return ['Enter a program title.'];
    if (s === 2 && (!start || !end || !venue.trim())) return ['Enter start date, end date, and venue.'];
    if (s === 3 && !structure.trim()) return ['Describe committees, sessions, or tracks.'];
    if (s === 4 && (!capacity || Number(capacity) < 1)) return ['Capacity must be at least 1.'];
    return [];
  };

  const saveDraft = async () => {
    const list = validate(1);
    if (list.length > 0) { setErrors(list); return; }
    setErrors([]);
    try {
      const payload = {
        title: title.trim(),
        category,
        single_event_type: category === 'SingleEvent' ? eventType : null,
        venue: venue || null,
        start_date: start || null,
        end_date: end || null,
        capacity: Number(capacity) || 60,
        description,
        status: 'Draft',
        created_by: session?.userId || null,
      };
      if (programId) {
        const res = await updateProgram(programId, payload);
        if (res?.error) throw new Error(res.error.message);
      } else {
        const res = await createProgram(payload);
        if (res?.error) throw new Error(res.error.message);
        const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
        if (row?.id) setProgramId(row.id);
      }
      setSavedAt(new Date().toLocaleTimeString());
      setDirty(false);
    } catch (err) {
      setErrors([`${err?.message || 'Could not save draft.'} Your input is preserved.`]);
    }
  };

  const submitForApproval = async () => {
    const all = [1, 2, 3, 4].flatMap(validate);
    setErrors(all);
    if (all.length > 0) return;
    try {
      let id = programId;
      const payload = {
        title: title.trim(),
        category,
        single_event_type: category === 'SingleEvent' ? eventType : null,
        venue,
        start_date: start,
        end_date: end,
        capacity: Number(capacity),
        description,
        status: 'UnderReview',
        created_by: session?.userId || null,
      };
      if (id) {
        const res = await updateProgram(id, payload);
        if (res?.error) throw new Error(res.error.message);
      } else {
        const res = await createProgram(payload);
        if (res?.error) throw new Error(res.error.message);
        const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
        id = row?.id || null;
        if (id) setProgramId(id);
      }
      if (id && structure.trim()) {
        try {
          const sres = await createSession({
            program_id: id,
            title: structure.trim().slice(0, 80),
            topic: structure.trim().slice(0, 120),
            date: start || null,
            venue: venue || null,
          });
          if (sres?.error) throw new Error(sres.error.message);
        } catch { /* sessions are best-effort; program submit still counts */ }
      }
      setSubmitted(true);
      setDirty(false);
    } catch (err) {
      setErrors([`${err?.message || 'Could not submit for approval.'} Your input is preserved.`]);
    }
  };

  if (submitted) {
    return (
      <div>
        <PageHead kicker="Program builder" title="Submitted for approval." desc="Your draft entered Submitted → Under Review. Editing is now restricted." />
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>What happens next.</strong> An administrator reviews <strong>{title || 'your program'}</strong> and approves, requests changes, or rejects it.
        </div>
        <Link to="/coordinator/programs" className="button secondary">Back to programs</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Program builder" title="New program." desc="Progressive steps. Save draft stays visible; review mirrors the public display."
        action={<Button variant="secondary" disabled={savingProgram} onClick={saveDraft}>{savingProgram ? 'Saving…' : `Save draft${savedAt ? ` · saved ${savedAt}` : ''}`}</Button>} />
      <div className="builder-grid">
        <ol aria-label="Builder steps" className="step-list">
          {STEPS.map((label, i) => (
            <li key={label}><button onClick={() => setStep(i + 1)} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'active' : undefined}>
              {i + 1}. {label}
            </button></li>
          ))}
        </ol>
        <div>
          <Progress value={step} max={STEPS.length} label={STEPS[step - 1]} />
          <ErrorSummary items={errors} />
          <section className="panel">
            <div className="panel-head"><h2>{STEPS[step - 1]}</h2><span className="tag">Step {step} of {STEPS.length}</span></div>
            <div className="panel-body">
              {step === 1 && (
                <div className="form-grid">
                  <div className="field span-two"><label>Title<input value={title} onChange={(e) => { setTitle(e.target.value); touch(); }} placeholder="e.g. Colombo Youth MUN 2026" /></label></div>
                  <div className="field"><label>Category<select value={category} onChange={(e) => { setCategory(e.target.value); touch(); }}>
                    <option value="SingleEvent">Single Event</option><option value="ContinuousProgramme">Continuous Programme</option><option value="SpecialProgramme">Special Programme</option>
                  </select></label></div>
                  {category === 'SingleEvent' && (
                    <div className="field"><label>Single-event type<select value={eventType} onChange={(e) => { setEventType(e.target.value); touch(); }}>
                      <option value="ModelUN">Model United Nations</option><option value="FriendlyDebate">Friendly Debate</option><option value="Competition">Competition</option><option value="Special">Special</option>
                    </select></label></div>
                  )}
                </div>
              )}
              {step === 2 && (
                <div className="form-grid">
                  <div className="field span-two"><label>Venue or online link<input value={venue} onChange={(e) => { setVenue(e.target.value); touch(); }} placeholder="BMICH, Colombo / https://…" /></label></div>
                  <div className="field"><label>Start date<input type="date" value={start} onChange={(e) => { setStart(e.target.value); touch(); }} /></label></div>
                  <div className="field"><label>End date<input type="date" value={end} onChange={(e) => { setEnd(e.target.value); touch(); }} /></label></div>
                </div>
              )}
              {step === 3 && (
                <div>
                  {category === 'SingleEvent' && eventType === 'ModelUN' && <div className="notice" style={{ marginBottom: 14 }}><strong>MUN structure.</strong> Add committees plus optional country/portfolio choices.</div>}
                  {category === 'SingleEvent' && eventType === 'FriendlyDebate' && <div className="notice" style={{ marginBottom: 14 }}><strong>Debate structure.</strong> Add sessions, motions/topics, teams, and dates.</div>}
                  {category === 'ContinuousProgramme' && <div className="notice" style={{ marginBottom: 14 }}><strong>Continuous structure.</strong> Add recurring sessions, cohort dates, and attendance expectations.</div>}
                  <div className="field"><label>Committees / sessions / tracks<textarea value={structure} onChange={(e) => { setStructure(e.target.value); touch(); }} /></label></div>
                </div>
              )}
              {step === 4 && (
                <div className="form-grid">
                  <div className="field"><label>Capacity<input type="number" min={1} value={capacity} onChange={(e) => { setCapacity(e.target.value); touch(); }} /></label></div>
                  <div className="field"><label>Eligibility<input placeholder="e.g. Open to all registered students" /></label></div>
                </div>
              )}
              {step === 5 && (
                <div className="form-grid">
                  <div className="field"><label>Cover image<input type="file" accept="image/png,image/jpeg" /></label><span className="field-hint">JPG or PNG, max 5 MB.</span></div>
                  <div className="field"><label>Description<textarea value={description} onChange={(e) => { setDescription(e.target.value); touch(); }} placeholder="Public description, contact, visibility…" /></label></div>
                </div>
              )}
              {step === 6 && (
                <div>
                  <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Review mirrors the eventual public display.</p>
                  <div className="flat-list">
                    {[['Title', title || '—'], ['Type', category === 'SingleEvent' ? eventType : category], ['Schedule', `${start || '—'} → ${end || '—'} · ${venue || '—'}`], ['Capacity', capacity], ['Structure', structure || '—'], ['Description', description || '—']].map(([k, v]) => (
                      <div key={k} className="list-row compact"><div className="row-meta">{k}</div><div className="row-main"><h3>{v}</h3></div></div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
                <Button variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</Button>
                {step < STEPS.length ? (
                  <Button onClick={() => { const list = validate(step); setErrors(list); if (list.length === 0) setStep((s) => s + 1); }}>Continue</Button>
                ) : (
                  <Button disabled={savingProgram} onClick={submitForApproval}>{savingProgram ? 'Submitting…' : 'Submit for approval'}</Button>
                )}
              </div>
            </div>
          </section>
          {dirty && <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 8 }}>Unsaved changes — use Save draft before leaving.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Program workspace tabs (Supabase-backed) ---------- */
const WORK_TABS = ['Overview', 'Sessions', 'Students', 'Evaluators', 'Performance', 'Settings'];

function Workspace({ programId, active }) {
  const { data: progRow, loading: progLoading, error: progError } = useSupabaseRecord({ table: 'programs', id: programId });
  const { data: sessionRows, loading: sessLoading, error: sessError } = useSupabaseList({ table: 'sessions', filters: { program_id: programId }, page: 1, pageSize: 50 });
  const { data: regRows, loading: regsLoading, error: regsError, refetch: refetchRegs } = useSupabaseList({ table: 'registrations', filters: { program_id: programId }, page: 1, pageSize: 50 });
  const { data: evalRows } = useSupabaseList({ table: 'program_evaluators', filters: { program_id: programId }, page: 1, pageSize: 20 });
  const [deciding, setDeciding] = useState(null);
  const [decideError, setDecideError] = useState('');

  // Owning-coordinator decision via the audited, capacity-checked RPC.
  const decideRegistration = async (regId, decision) => {
    setDecideError('');
    setDeciding(regId);
    try {
      const { error } = await supabase.rpc('confirm_registration', { p_registration_id: regId, p_decision: decision });
      if (error) throw new Error(error.message);
      refetchRegs?.();
    } catch (err) {
      setDecideError(err?.message || 'Could not record decision.');
    } finally {
      setDeciding(null);
    }
  };

  if (progLoading) return <div><p>Loading…</p><SkeletonRows rows={4} /></div>;
  if (progError) return <div className="notice"><strong>Couldn’t load this program.</strong> {progError.message}</div>;
  if (!progRow) return <div className="notice"><strong>Program not found.</strong> It may have been removed.</div>;

  const program = toProgram(progRow);
  const sessions = (sessionRows || []).map(toSession);
  const roster = (regRows || []).map(toRegistration);
  const evaluatorCount = (evalRows || []).length;
  const nextAction = { Draft: 'Submit for approval', ChangesRequested: 'Revise and resubmit', Approved: 'Publish to directory', Published: 'Close registration when full', InProgress: 'Track evaluations', UnderReview: 'Awaiting admin review' };

  return (
    <div>
      <PageHead kicker="Program workspace" title={`${program.title}.`} desc={`${program.institute} · ${program.startDate} → ${program.endDate} · Next: ${nextAction[program.status] || program.status}`}
        action={<div style={{ display: 'flex', gap: 10 }}><Status value={program.status} /><Link to={`/coordinator/programs/${program.id}/edit`} className="button secondary small">Edit</Link></div>} />
      <Tabs tabs={WORK_TABS} active={active} base={`/coordinator/programs/${program.id}`} />
      {active === 'Overview' && (
        <div className="flat-list">
          {[['Type', program.typeLabel || program.category], ['Venue', program.venue], ['Capacity', `${program.registered}/${program.capacity}`], ['Description', program.description]].map(([k, v]) => (
            <div key={k} className="list-row compact"><div className="row-meta">{k}</div><div className="row-main"><h3>{v}</h3></div></div>
          ))}
        </div>
      )}
      {active === 'Sessions' && (
        <>
          {sessLoading && <p>Loading…</p>}
          {sessError && <div className="notice"><strong>Couldn’t load sessions.</strong> {sessError.message}</div>}
          {!sessLoading && !sessError && <DataTable headers={['Session', 'Topic', 'Date', 'Venue']} rows={sessions.map((s) => [s.title, s.topic, s.date, s.venue])} />}
        </>
      )}
      {active === 'Students' && (
        <>
          {regsLoading && <p>Loading…</p>}
          {regsError && <div className="notice"><strong>Couldn’t load students.</strong> {regsError.message}</div>}
          {decideError && <p role="alert" className="field-error">{decideError}</p>}
          {!regsLoading && !regsError && (
            <DataTable headers={['Student', 'ElevateMe ID', 'Allocation', 'Registration', 'Evaluation', '']}
              rows={roster.map((r) => [r.studentName, r.elevateMeId, r.allocation, <Status key={`${r.id}-s`} value={r.status} />, <Status key={`${r.id}-e`} value={r.evaluationState} />,
                r.status === 'Pending'
                  ? <span key={`${r.id}-a`} style={{ display: 'flex', gap: 6 }}>
                    <Button small disabled={deciding === r.id} onClick={() => decideRegistration(r.id, 'Confirmed')}>Confirm</Button>
                    <Button small variant="secondary" disabled={deciding === r.id} onClick={() => decideRegistration(r.id, 'Waitlisted')}>Waitlist</Button>
                    <Button small variant="secondary" disabled={deciding === r.id} onClick={() => decideRegistration(r.id, 'Rejected')}>Reject</Button>
                  </span>
                  : <span key={`${r.id}-a`} style={{ color: 'var(--muted)', fontSize: '.82rem' }}>Decided</span>])} />
          )}
        </>
      )}
      {active === 'Evaluators' && (
        evaluatorCount > 0 ? (
          <DataTable headers={['Evaluator', 'Session', 'Access']} rows={(evalRows || []).map((e, i) => [e.evaluator_id || `Evaluator ${i + 1}`, sessions[0]?.title || '—', <Status key={`e-${i}`} value={e.status || 'Approved'} />])} />
        ) : (
          <Empty title="No evaluators assigned." body="Assign evaluators to this program to begin." />
        )
      )}
      {active === 'Performance' && <p style={{ color: 'var(--muted)' }}>Individual and aggregate views unlock in Performance once evaluations are released.</p>}
      {active === 'Settings' && <p style={{ color: 'var(--muted)' }}>Registration window, capacity, visibility, and contact details. Editing is restricted after submission according to lifecycle status.</p>}
    </div>
  );
}

export function ProgramOverview() { const { programId } = useParams(); return <Workspace programId={programId} active="Overview" />; }
export function ProgramSessionsTab() { const { programId } = useParams(); return <Workspace programId={programId} active="Sessions" />; }
export function ProgramStudentsTab() { const { programId } = useParams(); return <Workspace programId={programId} active="Students" />; }
export function ProgramEvaluatorsTab() { const { programId } = useParams(); return <Workspace programId={programId} active="Evaluators" />; }

export function ProgramEdit() {
  const { programId } = useParams();
  const { data: progRow, loading, error } = useSupabaseRecord({ table: 'programs', id: programId });
  const { update, saving, error: saveError } = useSupabaseMutation({ table: 'programs' });
  const [saved, setSaved] = useState(false);

  if (loading) return <div><p>Loading…</p><SkeletonRows rows={3} /></div>;
  if (error) return <div className="notice"><strong>Couldn’t load this program.</strong> {error.message}</div>;
  if (!progRow) return <div className="notice"><strong>Program not found.</strong></div>;
  const program = toProgram(progRow);
  const editable = program.status === 'Draft' || program.status === 'ChangesRequested';
  return (
    <div>
      <PageHead kicker="Edit program" title={`${program.title}.`} desc={`Status: ${program.status}`} />
      {editable ? (
        <Panel title="Edit fields" action={<span className="tag">Draft form</span>}>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Draft editing for {program.title}.</p>
          {saveError && <p role="alert" className="field-error">{saveError.message}</p>}
          {saved && <div className="notice">Draft saved.</div>}
          <div style={{ marginTop: 12 }}><Button disabled={saving} onClick={async () => {
            try {
              const res = await update(programId, { title: program.title });
              if (res?.error) throw new Error(res.error.message);
              setSaved(true);
            } catch { /* error shown via saveError */ }
          }}>{saving ? 'Saving…' : 'Save changes'}</Button></div>
        </Panel>
      ) : (
        <div className="notice">
          <strong>Editing restricted.</strong> {program.title} is <strong>{program.status}</strong>. After submission, editing is restricted according to
          lifecycle status — request changes through the admin queue or duplicate as a new draft.
          <div style={{ marginTop: 10 }}><Link to={`/coordinator/programs/${program.id}`} className="button secondary small">Back to workspace</Link></div>
        </div>
      )}
    </div>
  );
}

/* ---------- Student details sheet (Supabase-backed) ---------- */
export function CoordinatorStudents() {
  const [q, setQ] = useState('');
  const { data: profileRows, loading, error } = useSupabaseList({
    table: 'profiles',
    search: q ? { col: 'full_name', term: q } : null,
    page: 1,
    pageSize: 20,
  });
  const { data: regRows } = useSupabaseList({ table: 'registrations', page: 1, pageSize: 100 });
  const { data: programRows } = useSupabaseList({ table: 'programs', page: 1, pageSize: 50 });
  const profiles = (profileRows || []).map(toProfile);
  const regs = (regRows || []).map(toRegistration);
  const rows = useMemo(() => profiles.map((r) => {
    const match = regs.find((x) => x.elevateMeId && r.elevateMeId && x.elevateMeId === r.elevateMeId);
    return {
      id: r.userId,
      name: r.name,
      elevateMeId: r.elevateMeId,
      allocation: match?.allocation || '—',
      registration: match?.status || '—',
      evaluation: match?.evaluationState || '—',
    };
  }), [profiles, regs]);

  return (
    <div>
      <PageHead kicker="Registered students" title="Student details sheet." desc="Search participants and check registration, allocation and evaluation status."
        action={<Button variant="secondary">Export CSV</Button>} />
      <div className="filter-bar">
        <input type="search" placeholder="Search name or ElevateMe ID" aria-label="Search name or ElevateMe ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Program"><option>All programs</option>{(programRows || []).map(toProgram).map((p) => <option key={p.id}>{p.title}</option>)}</select>
        <select aria-label="Committee"><option>All committees</option></select>
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load students.</strong> {error.message}</div>}
      {!loading && !error && (
        <DataTable headers={['No.', 'Name', 'ElevateMe ID', 'Allocation', 'Registration', 'Evaluation']}
          rows={rows.map((r, i) => [
            String(i + 1).padStart(2, '0'),
            <Link key="n" to={`/coordinator/students/${r.elevateMeId}`} className="link-quiet"><strong>{r.name}</strong></Link>,
            r.elevateMeId, r.allocation,
            <Status key="r" value={r.registration} />, <Status key="e" value={r.evaluation} />,
          ])} caption="Registered students" />
      )}
    </div>
  );
}

export function CoordinatorStudentDetail() {
  const { studentId } = useParams();
  const { data: profileRows } = useSupabaseList({ table: 'profiles', filters: { elevate_me_id: studentId }, page: 1, pageSize: 1 });
  const { data: evalRows } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 50 });
  const profile = (profileRows || []).map(toProfile)[0];
  const releasedCount = (evalRows || []).map(toEvaluation).filter((e) => e.released).length;
  return (
    <div>
      <PageHead kicker="Student record" title={`Student ${studentId}.`} desc="Registrations, released evaluations, recommendations." />
      <Panel title={profile?.name || `Student ${studentId}`} action={<Status value={profile?.status || 'Approved'} />}>
        <p style={{ fontSize: '.9rem' }}>{studentId}{profile?.institute ? ` · ${profile.institute}` : ''} · {releasedCount} released evaluations.</p>
      </Panel>
    </div>
  );
}

/* ---------- Evaluators (Supabase-backed, literals as fallback) ---------- */
export function CoordinatorEvaluators() {
  const { data, loading, error } = useSupabaseList({ table: 'program_evaluators', page: 1, pageSize: 20 });
  const { data: profileRows } = useSupabaseList({ table: 'profiles', page: 1, pageSize: 50 });
  const nameById = new Map((profileRows || []).map(toProfile).map((p) => [p.userId, p.name]));
  const rows = (data || []).map((e, i) => {
    const name = nameById.get(e.evaluator_id) || e.evaluator_id || `Evaluator ${i + 1}`;
    return [
      <span key={`a-${i}`}><strong>{name}</strong><br /><span className="row-meta">{e.evaluator_id || ''}</span></span>,
      e.program_id || e.session_id || 'Assigned program',
      '—',
      '—',
      <Status key={`s-${i}`} value={e.status || 'Active'} />,
    ];
  });
  if (loading) return <div><PageHead kicker="Access management" title="Evaluators." desc="Assign resource people to a program or session and track submission progress." action={<Button>Invite evaluator →</Button>} /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Access management" title="Evaluators." desc="Assign resource people to a program or session and track submission progress." action={<Button>Invite evaluator →</Button>} /><div className="notice"><strong>Couldn’t load evaluators.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Access management" title="Evaluators." desc="Assign resource people to a program or session and track submission progress."
        action={<Button>Invite evaluator →</Button>} />
      {rows.length > 0 ? (
        <DataTable headers={['Resource person', 'Assignment', 'Students', 'Progress', 'Access']} rows={rows} />
      ) : (
        <Empty title="No evaluators assigned." body="Invite resource people to a program or session to begin." />
      )}
    </div>
  );
}

export function CoordinatorSessions() {
  const { data, loading, error } = useSupabaseList({ table: 'programs', page: 1, pageSize: 20 });
  const programs = (data || []).map(toProgram);
  if (loading) return <div><PageHead kicker="Schedule" title="Sessions / Committees." desc="MUN committees, debate motions, continuous-program sessions." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Schedule" title="Sessions / Committees." desc="MUN committees, debate motions, continuous-program sessions." /><div className="notice"><strong>Couldn’t load sessions.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Schedule" title="Sessions / Committees." desc="MUN committees, debate motions, continuous-program sessions." />
      <Panel title="Sessions" action={<span className="tag">Open the program workspace for per-program tabs</span>}>
        <div className="flat-list">
          {programs.map((p) => (
            <div key={p.id} className="list-row compact">
              <div className="row-meta">{p.date}</div>
              <div className="row-main"><h3>{p.title}</h3><p>{p.meta}</p></div>
              <Link to={`/coordinator/programs/${p.id}/sessions`} className="button secondary small">Open</Link>
            </div>
          ))}
          {programs.length === 0 && <p style={{ color: 'var(--muted)' }}>No programs yet.</p>}
        </div>
      </Panel>
    </div>
  );
}

/* ---------- Coordinator performance + insights + profile ---------- */
export function CoordinatorPerformance() {
  const { data: evalRows } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 5 });
  const releasedCount = (evalRows || []).length;
  return (
    <div>
      <PageHead kicker="Performance" title="Cohort progress." desc="Filter the evidence by skill, period and session. Insights below are based only on released evaluations." />
      <div className="filter-bar">
        <select aria-label="Select skill"><option>Confidence</option><option>Clarity</option><option>Counter Arguments</option></select>
        <select aria-label="Select time period"><option>Last 6 months</option><option>Last 3 months</option></select>
        <Button small>Apply filters</Button>
      </div>
      <div className="grid dashboard">
        <section className="chart-panel">
          <ChartSummary label="Cohort average total" value={releasedCount > 0 ? `${releasedCount} released` : 'No released scores'} status={<Status value="Improving" />} />
          <LineChart />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Cohort Insights</h2><span className="tag">{releasedCount > 0 ? '3 findings' : 'No data'}</span></div>
          <div className="panel-body">
            {releasedCount > 0 ? (
              <InsightList items={[
                { label: 'Strongest', text: 'Audience Addressing leads the cohort.', small: 'Released evaluations' },
                { label: 'Next focus', text: 'Counter Arguments trails the cohort.', small: 'Matches recommendations' },
                { label: 'Coverage', text: `${releasedCount} released evaluations in scope.`, small: 'Min 3 evaluations' },
              ]} />
            ) : (
              <Empty title="No insights yet." body="Insights appear once evaluations are released." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function CoordinatorInsights() {
  const { data: evalRows } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 5 });
  const releasedCount = (evalRows || []).length;
  return (
    <div>
      <PageHead kicker="Insights" title="Cohort insights." desc="Rule-based, evidence-windowed. Minimum 3 evaluations before trend claims." />
      {releasedCount >= 3 ? (
        <Panel title="Released evaluations" action={<Tag>{releasedCount} in scope</Tag>}>
          <InsightList items={[
            { label: 'Strongest', text: 'Audience Addressing leads the cohort.' },
            { label: 'Needs work', text: 'Counter Arguments trails — matches recommendations.' },
          ]} />
        </Panel>
      ) : (
        <Panel title="Cohort insights" action={<Tag>No data</Tag>}>
          <div className="panel-body"><Empty title="Not enough data yet." body="Trend claims need a minimum of 3 released evaluations." /></div>
        </Panel>
      )}
    </div>
  );
}

export function CoordinatorProfile() {
  const { session } = useAuth();
  const { data: profile } = useSupabaseRecord({ table: 'profiles', id: session?.userId });
  const fullName = profile?.full_name || session?.name || '';
  const email = profile?.email || session?.email || '';
  const status = profile?.status || session?.status || 'PendingReview';
  const rolesLabel = (profile?.roles || session?.availableRoles || []).join(', ') || '—';
  return (
    <div>
      <PageHead kicker="Account" title="Your profile." desc="Institutional profile. Approval by admin; cannot self-approve." />
      <section className="panel">
        <div className="panel-head"><h2>Coordinator details</h2><Status value={status} /></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Full name<input defaultValue={fullName} key={fullName} /></label></div>
          <div className="field"><label>Institute<input defaultValue={profile?.institute || ''} key={profile?.institute || 'inst'} /></label></div>
          <div className="field"><label>Email<input defaultValue={email} type="email" /></label></div>
          <div className="field"><label>Roles<input defaultValue={rolesLabel} disabled /></label></div>
        </div>
      </section>
    </div>
  );
}
