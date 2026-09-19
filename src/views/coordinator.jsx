import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, DataTable, ErrorSummary, Metrics, PageHead, Panel, Progress, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList, LineChart, Tabs } from '../components/domain.jsx';
import { mockEvaluations, mockPrograms, mockRegistrations, mockRoster, mockSessions } from '../lib/mock-data.js';

/* ---------- Coordinator overview (prototype) ---------- */
export function CoordinatorDashboard() {
  return (
    <div>
      <PageHead kicker="Coordinator overview" title="Programs at a glance." desc="Monitor registration, session readiness and evaluation completion."
        action={<Link to="/coordinator/programs" className="button">Create program →</Link>} />
      <Metrics items={[
        ['Active programs', '03', '1 pending approval'],
        ['Registered students', '86', 'Across all programs'],
        ['Evaluations due', '14', 'Before 30 September'],
        ['Average total', '70 · 50 + 20', '+4 points this term'],
      ]} />
      <div className="grid dashboard">
        <section className="panel">
          <div className="panel-head"><h2>Program status</h2><Link to="/coordinator/programs" className="button quiet small">Manage all →</Link></div>
          <div className="panel-body">
            <div className="flat-list">
              {mockPrograms.slice(0, 3).map((p) => (
                <div key={p.id} className="list-row compact">
                  <div className="row-meta">{p.date}</div>
                  <div className="row-main"><h3>{p.title}</h3><p>{p.meta}</p></div>
                  <Status value={p.status === 'UnderReview' ? 'Pending review' : p.status} />
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Needs attention</h2><span className="nav-count">03</span></div>
          <div className="panel-body">
            <InsightList items={[
              { label: 'Evaluation', text: '14 student evaluations are still incomplete.', small: 'Academic Speaking · Session 06' },
              { label: 'Approval', text: 'Friendly Debate draft needs your changes.', small: 'Admin note received today' },
              { label: 'Capacity', text: 'Colombo Youth MUN is 88% full.', small: 'Registration closes 10 October' },
            ]} />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Programme management (prototype + kept builder) ---------- */
export function CoordinatorPrograms() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ title: '', type: 'Single Event', start: '', capacity: '30', desc: '' });

  const rows = mockPrograms.filter((p) =>
    (!q || p.title.toLowerCase().includes(q.toLowerCase())) &&
    (status === 'All statuses' || p.status === status));

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
            <div className="span-two"><Button onClick={() => setShowForm(false)}>Save draft</Button></div>
          </div>
        </section>
      )}
      <div className="filter-bar">
        <input type="search" placeholder="Search your programs" aria-label="Search your programs" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>All statuses</option><option>Published</option><option>InProgress</option><option>UnderReview</option>
        </select>
      </div>
      <DataTable headers={['Program', 'Type', 'Date', 'Students', 'Status', '']}
        rows={rows.map((p) => [
          <strong key="t">{p.title}</strong>, p.typeLabel, `${p.date} 2026`, `${p.registered} / ${p.capacity}`,
          <Status key="s" value={p.status} />,
          <Link key="m" to={`/coordinator/programs/${p.id}`} className="button secondary small">Manage</Link>,
        ])} caption="Managed programs" />
    </div>
  );
}

/* ---------- Guided 6-step builder (kept engineered flow) ---------- */
const STEPS = ['Basics', 'Schedule and location', 'Program structure', 'Registration rules', 'Media and description', 'Review and submit'];

export function NewProgram() {
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
        action={<Button variant="secondary" onClick={() => { setSavedAt(new Date().toLocaleTimeString()); setDirty(false); }}>Save draft{savedAt ? ` · saved ${savedAt}` : ''}</Button>} />
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
                  <Button onClick={() => { const all = [1, 2, 3, 4].flatMap(validate); setErrors(all); if (all.length === 0) setSubmitted(true); }}>Submit for approval</Button>
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

/* ---------- Program workspace tabs (kept) ---------- */
const WORK_TABS = ['Overview', 'Sessions', 'Students', 'Evaluators', 'Performance', 'Settings'];

function Workspace({ programId, active }) {
  const program = mockPrograms.find((p) => p.id === programId) || mockPrograms[0];
  const sessions = mockSessions.filter((s) => s.programId === program.id);
  const roster = mockRegistrations.filter((r) => r.programId === program.id);
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
        <DataTable headers={['Session', 'Topic', 'Date', 'Venue']} rows={sessions.map((s) => [s.title, s.topic, s.date, s.venue])} />
      )}
      {active === 'Students' && (
        <DataTable headers={['Student', 'ElevateMe ID', 'Allocation', 'Registration', 'Evaluation']}
          rows={roster.map((r) => [r.studentName, r.elevateMeId, r.allocation, <Status key={`${r.id}-s`} value={r.status} />, <Status key={`${r.id}-e`} value={r.evaluationState} />])} />
      )}
      {active === 'Evaluators' && (
        <DataTable headers={['Evaluator', 'Session', 'Access']} rows={[['Dr. Jayasinghe', sessions[0]?.title || '—', <Status key="e" value="Approved" />]]} />
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
  const program = mockPrograms.find((p) => p.id === programId) || mockPrograms[0];
  const editable = program.status === 'Draft' || program.status === 'ChangesRequested';
  return (
    <div>
      <PageHead kicker="Edit program" title={`${program.title}.`} desc={`Status: ${program.status}`} />
      {editable ? (
        <Panel title="Edit fields" action={<span className="tag">Mock form</span>}>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Draft editing for {program.title}.</p>
          <div style={{ marginTop: 12 }}><Button>Save changes</Button></div>
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

/* ---------- Student details sheet (prototype studentsPage) ---------- */
export function CoordinatorStudents() {
  const [q, setQ] = useState('');
  const rows = useMemo(() => mockRoster.filter((r) =>
    !q || `${r.name} ${r.elevateMeId}`.toLowerCase().includes(q.toLowerCase())), [q]);

  return (
    <div>
      <PageHead kicker="Registered students" title="Student details sheet." desc="Search participants and check registration, allocation and evaluation status."
        action={<Button variant="secondary">Export CSV</Button>} />
      <div className="filter-bar">
        <input type="search" placeholder="Search name or ElevateMe ID" aria-label="Search name or ElevateMe ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Program"><option>All programs</option><option>Colombo Youth MUN 2026</option><option>Academic Speaking — Cohort 03</option></select>
        <select aria-label="Committee"><option>All committees</option><option>WHO</option><option>UNHCR</option><option>UNSC</option></select>
      </div>
      <DataTable headers={['No.', 'Name', 'ElevateMe ID', 'Allocation', 'Registration', 'Evaluation']}
        rows={rows.map((r, i) => [
          String(i + 1).padStart(2, '0'),
          <Link key="n" to={`/coordinator/students/${r.elevateMeId}`} className="link-quiet"><strong>{r.name}</strong></Link>,
          r.elevateMeId, r.allocation,
          <Status key="r" value={r.registration} />, <Status key="e" value={r.evaluation} />,
        ])} caption="Registered students" />
    </div>
  );
}

export function CoordinatorStudentDetail() {
  const { studentId } = useParams();
  const evals = mockEvaluations.filter((e) => e.elevateMeId === studentId);
  return (
    <div>
      <PageHead kicker="Student record" title={`Student ${studentId}.`} desc="Registrations, released evaluations, recommendations." />
      <Panel title="Nimuthu Fernando" action={<Status value="Approved" />}>
        <p style={{ fontSize: '.9rem' }}>{studentId} · Royal College, Colombo · {evals.filter((e) => e.released).length} released evaluations · 3 active recommendations.</p>
      </Panel>
    </div>
  );
}

/* ---------- Evaluators (prototype) ---------- */
export function CoordinatorEvaluators() {
  return (
    <div>
      <PageHead kicker="Access management" title="Evaluators." desc="Assign resource people to a program or session and track submission progress."
        action={<Button>Invite evaluator →</Button>} />
      <DataTable headers={['Resource person', 'Assignment', 'Students', 'Progress', 'Access']}
        rows={[
          [<span key="a"><strong>Dr. Jayasinghe</strong><br /><span className="row-meta">drj@example.com</span></span>, 'Academic Speaking · Session 06', '18', '12 / 18 submitted', <Status key="s" value="Active" />],
          [<span key="b"><strong>Ms. Wickramasinghe</strong><br /><span className="row-meta">maya@example.com</span></span>, 'Colombo Youth MUN · WHO', '16', '0 / 16 submitted', <Status key="t" value="Scheduled" />],
        ]} />
    </div>
  );
}

export function CoordinatorSessions() {
  return (
    <div>
      <PageHead kicker="Schedule" title="Sessions / Committees." desc="MUN committees, debate motions, continuous-program sessions." />
      <Panel title="Sessions" action={<span className="tag">Open the program workspace for per-program tabs</span>}>
        <div className="flat-list">
          {mockPrograms.map((p) => (
            <div key={p.id} className="list-row compact">
              <div className="row-meta">{p.date}</div>
              <div className="row-main"><h3>{p.title}</h3><p>{p.meta}</p></div>
              <Link to={`/coordinator/programs/${p.id}/sessions`} className="button secondary small">Open</Link>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ---------- Coordinator performance + insights + profile ---------- */
export function CoordinatorPerformance() {
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
          <ChartSummary label="Cohort average total" value="70 · 50 + 20" status={<Status value="Improving" />} />
          <LineChart />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Cohort Insights</h2><span className="tag">3 findings</span></div>
          <div className="panel-body">
            <InsightList items={[
              { label: 'Strongest', text: 'Audience Addressing leads at a VG median.', small: 'Cohort 03 · 3 sessions' },
              { label: 'Next focus', text: 'Counter Arguments trails at a G median.', small: 'Matches pilot recommendations' },
              { label: 'Coverage', text: '32 of 40 students have enough data for trends.', small: 'Min 3 evaluations' },
            ]} />
          </div>
        </section>
      </div>
    </div>
  );
}

export function CoordinatorInsights() {
  return (
    <div>
      <PageHead kicker="Insights" title="Cohort insights." desc="Rule-based, evidence-windowed. Minimum 3 evaluations before trend claims." />
      <Panel title="Cohort 03 — Academic Speaking" action={<Tag>18 students · Session 06</Tag>}>
        <InsightList items={[
          { label: 'Strongest', text: 'Audience Addressing (VG median).' },
          { label: 'Needs work', text: 'Counter Arguments (G median) — matches pilot recommendations.' },
        ]} />
      </Panel>
    </div>
  );
}

export function CoordinatorProfile() {
  return (
    <div>
      <PageHead kicker="Account" title="Your profile." desc="Institutional profile. Approval by admin; cannot self-approve." action={<Button>Save changes</Button>} />
      <section className="panel">
        <div className="panel-head"><h2>Coordinator details</h2><Status value="Approved" /></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Full name<input defaultValue="Ms. Perera" /></label></div>
          <div className="field"><label>Institute<input defaultValue="Royal College, Colombo" /></label></div>
          <div className="field"><label>Email<input defaultValue="perera@college.edu" type="email" /></label></div>
          <div className="field"><label>Roles<input defaultValue="Coordinator, Evaluator" disabled /></label></div>
        </div>
      </section>
    </div>
  );
}
