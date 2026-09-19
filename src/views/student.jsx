import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Empty, Metrics, PageHead, Panel, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList, LineChart, ProgramListRow, RecommendationRecord } from '../components/domain.jsx';
import { LEVEL_HELP, mockAnnouncements, mockEvaluations, mockPrograms, mockRecommendations, mockRegistrations, publishedPrograms, total50 } from '../lib/mock-data.js';
import { NotFound } from './public.jsx';

/* ---------- Student overview (prototype studentDashboard) ---------- */
export function StudentDashboard() {
  return (
    <div>
      <PageHead kicker="Student overview" title="Good evening, Nimuthu." desc="Here is what is happening across your programs, performance and next steps."
        action={<Link to="/student/programs" className="button">Find a program →</Link>} />
      <Metrics items={[
        ['ElevateMe ID', 'EM-00124', 'Your permanent student ID'],
        ['Overall total', '72 · 50 + 22', '+6 points this term'],
        ['Active programs', '02', '1 upcoming session'],
        ['Recommendations', '03', '1 marked high priority'],
      ]} />
      <div className="grid dashboard">
        <section className="program-feature">
          <div><span className="tag">Next session · 24 October</span><h2>Colombo Youth<br />MUN 2026</h2><p>WHO Committee · Representing Japan<br />Registration confirmed</p></div>
          <Link to="/student/registrations" className="button">View event details →</Link>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Latest insight</h2><Status value="Improving" /></div>
          <div className="panel-body">
            <h3 style={{ font: '700 1.65rem/1.1 Manrope', margin: '0 0 13px' }}>Confidence is moving in the right direction.</h3>
            <p style={{ color: 'var(--muted)' }}>Your score rose in four consecutive evaluated sessions.</p>
            <Link to="/student/performance" className="button quiet">See performance →</Link>
          </div>
        </section>
      </div>
      <h2 className="section-title">What needs your attention</h2>
      <div className="flat-list">
        <div className="list-row compact">
          <div className="row-meta">Recommendation</div>
          <div className="row-main"><h3>Practice structured rebuttals</h3><p>Suggested by Diplomatic Impact · High priority</p></div>
          <Link to="/student/recommendations" className="button secondary small">Review</Link>
        </div>
        <div className="list-row compact">
          <div className="row-meta">Announcement</div>
          <div className="row-main"><h3>Country allocations are now confirmed</h3><p>Colombo Youth MUN · Published today</p></div>
          <Link to="/student/announcements" className="button secondary small">Read</Link>
        </div>
      </div>
    </div>
  );
}

/* ---------- Student programs (prototype studentPrograms) ---------- */
export function StudentPrograms() {
  const [q, setQ] = useState('');
  const programs = publishedPrograms().filter((p) =>
    !q || `${p.date} ${p.typeLabel} ${p.title} ${p.meta}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead kicker="Programs" title="Find your next experience." desc="Browse approved events and continuous programs designed to build communication, leadership and critical-thinking skills." />
      <div className="filter-bar">
        <input type="search" placeholder="Search programs" aria-label="Search programs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flat-list">
        {programs.length === 0 && <Empty title="No programs found." body="Try another search." action={<Button variant="secondary" small onClick={() => setQ('')}>Clear search</Button>} />}
        {programs.map((p) => (
          <ProgramListRow key={p.id} date={p.date} type={p.typeLabel} title={p.title} meta={p.meta}
            status={p.registered >= p.capacity ? 'RegistrationClosed' : 'Open'}
            linkTo={`/student/programs/${p.id}`} actionLabel="View & register →" />
        ))}
      </div>
    </div>
  );
}

/* ---------- My registrations (prototype) ---------- */
export function StudentRegistrations() {
  return (
    <div>
      <PageHead kicker="My registrations" title="Programs you have joined." desc="Track confirmations, allocations and upcoming sessions in one place." />
      <div className="flat-list">
        {mockRegistrations.map((r) => {
          const p = mockPrograms.find((x) => x.id === r.programId);
          return (
            <article key={r.id} className="list-row">
              <div className="row-meta">{r.when}</div>
              <div className="row-main"><h3>{p?.title}</h3><p>{r.allocation}</p></div>
              <div className="row-action"><Status value={r.status} /><Link to={`/student/programs/${r.programId}`} className="button secondary small">Details</Link></div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Performance (prototype performancePage, two sections) ---------- */
export function StudentPerformance() {
  const [applied, setApplied] = useState(false);
  return (
    <div>
      <PageHead kicker="Performance" title="Your progress." desc="Filter the evidence by skill, period and session. Insights below are based only on released evaluations." />
      <div className="filter-bar">
        <select aria-label="Select skill"><option>Confidence</option><option>Clarity</option><option>Critical Analysis</option><option>Counter Arguments</option></select>
        <select aria-label="Select time period"><option>Last 6 months</option><option>Last 3 months</option><option>All time</option></select>
        <select aria-label="Select sessions"><option>All sessions</option><option>Academic Speaking</option><option>Colombo Youth MUN</option></select>
        <Button small onClick={() => setApplied(true)}>{applied ? 'Filters applied' : 'Apply filters'}</Button>
      </div>
      <div className="grid dashboard">
        <section className="chart-panel">
          <ChartSummary label="Current total" value="72 · 50 + 22" status={<Status value="Improving" />} />
          <LineChart />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Your Insights</h2><span className="tag">3 findings</span></div>
          <div className="panel-body">
            <InsightList items={[
              { label: 'Improving', text: 'Total rose from 64 to 72 across the last four sessions.', small: 'Based on 4 released evaluations' },
              { label: 'Strongest', text: 'Preparation remains the strongest skill, most often VG.', small: 'Across all programs' },
              { label: 'Next focus', text: 'Counter Arguments is the clearest development opportunity.', small: 'Recommended next: Friendly Debate' },
            ]} />
            <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 12 }}>
              Detail per sheet: <Link to="/student/performance/e-1" className="link-quiet">Open latest released evaluation</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export function EvaluationDetail() {
  const { evaluationId } = useParams();
  const evaluation = mockEvaluations.find((e) => e.id === evaluationId);
  if (!evaluation || !evaluation.released) return <NotFound />;
  return (
    <div>
      <PageHead kicker="Released evaluation" title={`${evaluation.session}.`} desc={`${evaluation.studentName} · ${evaluation.elevateMeId} · ${evaluation.state}`} action={<Status value="Locked" />} />
      <div className="grid two">
        <Panel title="Criterion scores" action={<span className="tag">50+ model</span>}>
          {evaluation.scores.map((s) => (
            <div key={s.criterion} className="list-row compact">
              <div className="row-main"><h3>{s.criterion}</h3><p>{LEVEL_HELP[s.level]} · +{total50([s.level]).added} pts</p></div>
              <div className="row-action"><strong style={{ fontSize: '1.2rem' }}>{s.level}</strong></div>
            </div>
          ))}
          <div className="list-row compact">
            <div className="row-main"><h3>Total</h3><p>Baseline 50 + {total50(evaluation.scores).added} across {evaluation.scores.length} criteria</p></div>
            <div className="row-action"><strong style={{ fontSize: '1.4rem' }}>{total50(evaluation.scores).total}</strong></div>
          </div>
        </Panel>
        <Panel title="Remarks" action={<span className="tag">Shared on release</span>}>
          <p style={{ color: 'var(--muted)', fontSize: '.92rem' }}>{evaluation.remarks}</p>
          <div style={{ marginTop: 14 }}><Link to="/student/performance" className="button secondary small">Back to performance</Link></div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------- Recommendations (prototype) ---------- */
export function StudentRecommendations() {
  const [filter, setFilter] = useState('All recommendations');
  const [done, setDone] = useState({});
  const visible = mockRecommendations.filter((r) => {
    if (filter === 'High priority') return r.priority === 'High priority';
    if (filter === 'Completed') return done[r.id] || r.status === 'Completed';
    return true;
  });
  return (
    <div>
      <PageHead kicker="Development" title="Recommendations." desc="Clear actions from Diplomatic Impact, connected to your performance and next level." />
      <div className="filter-bar">
        <select aria-label="Filter recommendations" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All recommendations</option><option>High priority</option><option>Completed</option>
        </select>
      </div>
      <section>
        {visible.map((r) => (
          <RecommendationRecord key={r.id} date={r.date} status={done[r.id] ? 'Complete' : r.priority}
            title={r.title} body={r.body}
            tags={<><Tag>{r.skill}</Tag>{r.related && <> · {r.related}</>}</>}
            action={!done[r.id] && r.status !== 'Completed' && (
              <Button small variant={r.priority === 'High priority' ? undefined : 'secondary'} onClick={() => setDone((d) => ({ ...d, [r.id]: true }))}>Mark complete</Button>
            )} />
        ))}
      </section>
    </div>
  );
}

/* ---------- Announcements (prototype) ---------- */
export function StudentAnnouncements() {
  return (
    <div>
      <PageHead kicker="Updates" title="Announcements." desc="Important notices from Diplomatic Impact and your programme coordinators." />
      <div className="flat-list">
        {mockAnnouncements.map((a) => (
          <article key={a.id} className="list-row">
            <div className="row-meta">{a.date}<br />{a.sender}</div>
            <div className="row-main"><h3>{a.title}</h3><p>{a.body}</p></div>
            <div className="row-action">
              {a.isNew ? <Status value="New" /> : <Link to="/student/performance" className="button secondary small">View</Link>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ---------- Profile (prototype) ---------- */
export function StudentProfile() {
  return (
    <div>
      <PageHead kicker="Account" title="Your profile." desc="Keep your student and contact information accurate." action={<Button>Save changes</Button>} />
      <section className="panel">
        <div className="panel-head"><h2>Student details</h2><Status value="Approved" /></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Full name<input defaultValue="Nimuthu Fernando" /></label></div>
          <div className="field"><label>ElevateMe ID<input defaultValue="EM-00124" disabled /></label></div>
          <div className="field"><label>Institute<input defaultValue="Royal College, Colombo" /></label></div>
          <div className="field"><label>Email<input defaultValue="nimuthu@example.com" type="email" /></label></div>
          <div className="field"><label>Telephone<input defaultValue="+94 77 123 4567" /></label></div>
          <div className="field"><label>Date of birth<input defaultValue="2008-05-14" type="date" /></label></div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Kept extras ---------- */
export function StudentDevelopment() {
  return (
    <div>
      <PageHead kicker="Development" title="Further development." desc="Follow-on programs matched to your insights." />
      <div className="grid two">
        <Panel title="Suggested next" action={<Tag>Counter Arguments</Tag>}>
          <p style={{ color: 'var(--muted)', fontSize: '.92rem' }}>Friendly Debate — Right vs Might. One evaluation round, rebuttal-heavy format.</p>
          <div style={{ marginTop: 12 }}><Link to="/student/programs/p-debate" className="button small">View program →</Link></div>
        </Panel>
        <Empty title="No enrolments yet" body="Completed development actions will be tracked here." />
      </div>
    </div>
  );
}

export function StudentParentAccess() {
  return (
    <div>
      <PageHead kicker="Family" title="Parent access." desc="Invite a parent via time-limited invitation — never open ID lookup." action={<Button>Issue invitation</Button>} />
      <Panel title="Linked parent" action={<Status value="Approved" />}>
        <p style={{ fontSize: '.92rem' }}>S. Fernando · s.fernando@example.com · sees same released data as student.</p>
      </Panel>
    </div>
  );
}
