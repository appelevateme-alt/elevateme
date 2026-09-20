import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Empty, Metrics, PageHead, Panel, SkeletonRows, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList, LineChart, ProgramListRow, RecommendationRecord } from '../components/domain.jsx';
import { formatTotal, total1000 } from '../lib/scores.js';
import { useSupabaseList, useSupabaseRecord, useSupabaseMutation } from '../lib/useSupabase.js';
import { toAnnouncement, toEvaluation, toProgram, toRecommendation, toRegistration } from '../lib/adapters.js';
import { useAuth } from '../lib/auth.jsx';
import { NotFound } from './public.jsx';

/* ---------- Student overview (prototype studentDashboard) ---------- */
export function StudentDashboard() {
  const { session } = useAuth();
  const firstName = session?.name ? session.name.split(' ')[0] : 'Nimuthu';
  const elevateMeId = session?.elevateMeId || 'EM-00124';

  const { data: regRows, count: regCount, loading: regsLoading } = useSupabaseList({
    table: 'registrations',
    filters: session?.userId ? { student_id: session.userId } : {},
    page: 1,
    pageSize: 6,
  });
  const { data: recRows, count: recCount, loading: recsLoading } = useSupabaseList({
    table: 'recommendations',
    filters: session?.userId ? { student_id: session.userId } : {},
    page: 1,
    pageSize: 20,
  });
  const { data: annRows } = useSupabaseList({ table: 'announcements', filters: { status: 'Published' }, page: 1, pageSize: 3 });

  const regs = (regRows || []).map(toRegistration);
  const recs = (recRows || []).map(toRecommendation);
  const anns = (annRows || []).map(toAnnouncement);
  const highPriority = recs.filter((r) => r.priority === 'High priority').length;
  const activePrograms = regsLoading ? '02' : String(regCount ?? regs.length).padStart(2, '0');
  const recLabel = recsLoading ? '03' : String(recCount ?? recs.length).padStart(2, '0');
  const topRec = recs[0];
  const topAnn = anns[0];

  return (
    <div>
      <PageHead kicker="Student overview" title={`Good evening, ${firstName}.`} desc="Here is what is happening across your programs, performance and next steps."
        action={<Link to="/student/programs" className="button">Find a program →</Link>} />
      <Metrics items={[
        ['ElevateMe ID', elevateMeId, 'Your permanent student ID'],
        ['Overall total', '800 / 1000 → 80 / 100', '+6 points this term'],
        ['Active programs', activePrograms, '1 upcoming session'],
        ['Recommendations', recLabel, highPriority > 0 ? `${highPriority} marked high priority` : '1 marked high priority'],
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
          <div className="row-main"><h3>{topRec?.title || 'Practice structured rebuttals'}</h3><p>{topRec ? `Suggested by Diplomatic Impact · ${topRec.priority}` : 'Suggested by Diplomatic Impact · High priority'}</p></div>
          <Link to="/student/recommendations" className="button secondary small">Review</Link>
        </div>
        <div className="list-row compact">
          <div className="row-meta">Announcement</div>
          <div className="row-main"><h3>{topAnn?.title || 'Country allocations are now confirmed'}</h3><p>{topAnn ? `${topAnn.title} · Published` : 'Colombo Youth MUN · Published today'}</p></div>
          <Link to="/student/announcements" className="button secondary small">Read</Link>
        </div>
      </div>
    </div>
  );
}

/* ---------- Student programs (prototype studentPrograms) ---------- */
export function StudentPrograms() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useSupabaseList({
    table: 'programs',
    search: q ? { col: 'title', term: q } : null,
    order: { col: 'start_date', ascending: true },
    page: 1,
    pageSize: 20,
  });
  const programs = (data || []).map(toProgram).filter((p) => {
    if (p.status !== 'Published' && p.status !== 'InProgress') return false;
    if (!q) return true;
    return `${p.date} ${p.typeLabel} ${p.title} ${p.meta}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div>
      <PageHead kicker="Programs" title="Find your next experience." desc="Browse approved events and continuous programs designed to build communication, leadership and critical-thinking skills." />
      <div className="filter-bar">
        <input type="search" placeholder="Search programs" aria-label="Search programs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load programs.</strong> {error.message}</div>}
      {!loading && !error && (
        <div className="flat-list">
          {programs.length === 0 && <Empty title="No programs found." body="Try another search." action={<Button variant="secondary" small onClick={() => setQ('')}>Clear search</Button>} />}
          {programs.map((p) => (
            <ProgramListRow key={p.id} date={p.date} type={p.typeLabel} title={p.title} meta={p.meta}
              status={(p.registered ?? 0) >= (p.capacity ?? 0) ? 'RegistrationClosed' : 'Open'}
              linkTo={`/student/programs/${p.id}`} actionLabel="View & register →" />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- My registrations (prototype) ---------- */
export function StudentRegistrations() {
  const { session } = useAuth();
  const { data: regRows, loading, error } = useSupabaseList({
    table: 'registrations',
    filters: session?.userId ? { student_id: session.userId } : {},
    page: 1,
    pageSize: 20,
  });
  const { data: progRows } = useSupabaseList({ table: 'programs', page: 1, pageSize: 50 });
  const programs = new Map((progRows || []).map(toProgram).map((p) => [p.id, p]));
  const regs = (regRows || []).map(toRegistration);

  if (loading) return <div><PageHead kicker="My registrations" title="Programs you have joined." desc="Track confirmations, allocations and upcoming sessions in one place." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="My registrations" title="Programs you have joined." desc="Track confirmations, allocations and upcoming sessions in one place." /><div className="notice"><strong>Couldn’t load registrations.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="My registrations" title="Programs you have joined." desc="Track confirmations, allocations and upcoming sessions in one place." />
      <div className="flat-list">
        {regs.length === 0 && <Empty title="No registrations yet." body="Browse programs and join your first experience." action={<Link to="/student/programs" className="button secondary small">Find a program</Link>} />}
        {regs.map((r) => {
          const p = programs.get(r.programId);
          return (
            <article key={r.id} className="list-row">
              <div className="row-meta">{r.when}</div>
              <div className="row-main"><h3>{p?.title || r.programId}</h3><p>{r.allocation}</p></div>
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
  const { session } = useAuth();
  const [applied, setApplied] = useState(false);
  const { data: evalRows, loading, error } = useSupabaseList({
    table: 'evaluations',
    filters: session?.userId ? { student_id: session.userId, released: true } : { released: true },
    page: 1,
    pageSize: 20,
  });
  const { data: scoreRows } = useSupabaseList({ table: 'evaluation_scores', page: 1, pageSize: 100 });
  const evals = (evalRows || []).map(toEvaluation).filter((e) => e.released);
  const evalIds = new Set(evals.map((e) => e.id));
  const myScores = (scoreRows || []).filter((s) => evalIds.has(s.evaluation_id ?? s.evaluationId));
  const totals = evals.map((e) => {
    const nums = myScores
      .filter((s) => (s.evaluation_id ?? s.evaluationId) === e.id)
      .map((s) => s.score ?? s.value);
    const calc = nums.length > 0 ? total1000(nums) : total1000((e.scores || []).map((s) => s.score));
    return calc;
  });
  const currentTotal = totals.length > 0 ? totals[totals.length - 1] : null;
  const firstTotal = totals.length > 0 ? totals[0] : null;
  const latestId = evals.length > 0 ? evals[evals.length - 1].id : 'e-1';
  const summaryValue = currentTotal != null ? formatTotal(currentTotal) : '800 / 1000 → 80 / 100';
  const insightItems = evals.length >= 1 ? [
    { label: 'Improving', text: totals.length >= 2 ? `Final score ${firstTotal.scaled} → ${currentTotal.scaled} across the last ${totals.length} sessions.` : `Latest released final score is ${currentTotal.scaled} / 100.`, small: `Based on ${evals.length} released evaluation${evals.length === 1 ? '' : 's'}` },
    { label: 'Strongest', text: 'Preparation remains the strongest skill, most often above 85.', small: 'Across all programs' },
    { label: 'Next focus', text: 'Counter Arguments is the clearest development opportunity.', small: 'Recommended next: Friendly Debate' },
  ] : [
    { label: 'Improving', text: 'Final score rose from 64 to 80 across the last four sessions.', small: 'Based on 4 released evaluations' },
    { label: 'Strongest', text: 'Preparation remains the strongest skill, most often above 85.', small: 'Across all programs' },
    { label: 'Next focus', text: 'Counter Arguments is the clearest development opportunity.', small: 'Recommended next: Friendly Debate' },
  ];

  return (
    <div>
      <PageHead kicker="Performance" title="Your progress." desc="Filter the evidence by skill, period and session. Insights below are based only on released evaluations." />
      <div className="filter-bar">
        <select aria-label="Select skill"><option>Confidence</option><option>Clarity</option><option>Critical Analysis</option><option>Counter Arguments</option></select>
        <select aria-label="Select time period"><option>Last 6 months</option><option>Last 3 months</option><option>All time</option></select>
        <select aria-label="Select sessions"><option>All sessions</option><option>Academic Speaking</option><option>Colombo Youth MUN</option></select>
        <Button small onClick={() => setApplied(true)}>{applied ? 'Filters applied' : 'Apply filters'}</Button>
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load performance.</strong> {error.message}</div>}
      {!loading && !error && (
        <div className="grid dashboard">
          <section className="chart-panel">
            <ChartSummary label="Current total" value={summaryValue} status={<Status value="Improving" />} />
            <LineChart />
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Your Insights</h2><span className="tag">3 findings</span></div>
            <div className="panel-body">
              <InsightList items={insightItems} />
              <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 12 }}>
                Detail per sheet: <Link to={`/student/performance/${latestId}`} className="link-quiet">Open latest released evaluation</Link>
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function EvaluationDetail() {
  const { evaluationId } = useParams();
  const { data: row, loading, error } = useSupabaseRecord({ table: 'evaluations', id: evaluationId });
  const { data: scoreRows, loading: scoresLoading, error: scoresError } = useSupabaseList({
    table: 'evaluation_scores',
    filters: { evaluation_id: evaluationId },
    page: 1,
    pageSize: 50,
  });

  if (loading || scoresLoading) return <div><p>Loading…</p><SkeletonRows rows={4} /></div>;
  if (error) return <div className="notice"><strong>Couldn’t load this evaluation.</strong> {error.message}</div>;
  if (scoresError) return <div className="notice"><strong>Couldn’t load scores.</strong> {scoresError.message}</div>;
  if (!row) return <NotFound />;
  const evaluation = toEvaluation(row);
  if (!evaluation.released) return <NotFound />;
  const scores = (scoreRows || []).map((s) => ({
    criterion: s.criterion_key ?? s.criterion ?? s.criterionKey ?? 'Criterion',
    score: s.score ?? s.value ?? null,
  }));
  const displayScores = scores.length > 0 ? scores : (evaluation.scores || []);
  const calc = total1000(displayScores.map((s) => s.score));

  return (
    <div>
      <PageHead kicker="Released evaluation" title={`${evaluation.session}.`} desc={`${evaluation.studentName} · ${evaluation.elevateMeId} · ${evaluation.state}`} action={<Status value="Locked" />} />
      <div className="grid two">
        <Panel title="Criterion scores" action={<span className="tag">1000-point sheet</span>}>
          {displayScores.map((s) => (
            <div key={s.criterion} className="list-row compact">
              <div className="row-main"><h3>{s.criterion}</h3><p>Criterion score out of 100</p></div>
              <div className="row-action"><strong style={{ fontSize: '1.2rem' }}>{s.score ?? '–'}</strong></div>
            </div>
          ))}
          <div className="list-row compact">
            <div className="row-main"><h3>Total</h3><p>{calc.total} across {displayScores.length} criteria · final {calc.scaled} / 100</p></div>
            <div className="row-action"><strong style={{ fontSize: '1.4rem' }}>{calc.total}</strong></div>
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
  const { session } = useAuth();
  const [filter, setFilter] = useState('All recommendations');
  const [done, setDone] = useState({});
  const { data, loading, error, refetch } = useSupabaseList({
    table: 'recommendations',
    filters: session?.userId ? { student_id: session.userId } : {},
    page: 1,
    pageSize: 20,
  });
  const { update, saving } = useSupabaseMutation({ table: 'recommendations' });
  const all = (data || []).map(toRecommendation);
  const visible = all.filter((r) => {
    if (filter === 'High priority') return r.priority === 'High priority';
    if (filter === 'Completed') return done[r.id] || r.status === 'Completed';
    return true;
  });

  if (loading) return <div><PageHead kicker="Development" title="Recommendations." desc="Clear actions from Diplomatic Impact, connected to your performance and next level." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Development" title="Recommendations." desc="Clear actions from Diplomatic Impact, connected to your performance and next level." /><div className="notice"><strong>Couldn’t load recommendations.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Development" title="Recommendations." desc="Clear actions from Diplomatic Impact, connected to your performance and next level." />
      <div className="filter-bar">
        <select aria-label="Filter recommendations" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All recommendations</option><option>High priority</option><option>Completed</option>
        </select>
      </div>
      <section>
        {visible.length === 0 && <Empty title="No recommendations." body="Try another filter." />}
        {visible.map((r) => (
          <RecommendationRecord key={r.id} date={r.date} status={done[r.id] ? 'Complete' : r.priority}
            title={r.title} body={r.body}
            tags={<><Tag>{r.skill}</Tag>{r.related && <> · {r.related}</>}</>}
            action={!done[r.id] && r.status !== 'Completed' && (
              <Button small disabled={saving} variant={r.priority === 'High priority' ? undefined : 'secondary'} onClick={async () => {
                try {
                  await update(r.id, { status: 'Completed' });
                  setDone((d) => ({ ...d, [r.id]: true }));
                  refetch?.();
                } catch {
                  setDone((d) => ({ ...d, [r.id]: true }));
                }
              }}>Mark complete</Button>
            )} />
        ))}
      </section>
    </div>
  );
}

/* ---------- Announcements (prototype) ---------- */
export function StudentAnnouncements() {
  const { data, loading, error } = useSupabaseList({
    table: 'announcements',
    filters: { status: 'Published' },
    order: { col: 'publish_date', ascending: false },
    page: 1,
    pageSize: 20,
  });
  const items = (data || []).map(toAnnouncement);

  if (loading) return <div><PageHead kicker="Updates" title="Announcements." desc="Important notices from Diplomatic Impact and your programme coordinators." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Updates" title="Announcements." desc="Important notices from Diplomatic Impact and your programme coordinators." /><div className="notice"><strong>Couldn’t load announcements.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Updates" title="Announcements." desc="Important notices from Diplomatic Impact and your programme coordinators." />
      <div className="flat-list">
        {items.length === 0 && <Empty title="No announcements." body="Check back later for updates." />}
        {items.map((a) => (
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
  const { session } = useAuth();
  const fullName = session?.name || 'Nimuthu Fernando';
  const emId = session?.elevateMeId || 'EM-00124';
  const email = session?.email || 'nimuthu@example.com';
  const status = session?.status || 'Approved';
  return (
    <div>
      <PageHead kicker="Account" title="Your profile." desc="Keep your student and contact information accurate." action={<Button>Save changes</Button>} />
      <section className="panel">
        <div className="panel-head"><h2>Student details</h2><Status value={status} /></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Full name<input defaultValue={fullName} /></label></div>
          <div className="field"><label>ElevateMe ID<input defaultValue={emId} disabled /></label></div>
          <div className="field"><label>Institute<input defaultValue="Royal College, Colombo" /></label></div>
          <div className="field"><label>Email<input defaultValue={email} type="email" /></label></div>
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
