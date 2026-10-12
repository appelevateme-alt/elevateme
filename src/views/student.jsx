import { useState } from 'react';
import { ReleasedPerformance } from '../features/evaluator-access/ReleasedPerformance.jsx';
import { Link, useParams } from 'react-router-dom';
import { Button, Empty, Metrics, PageHead, Panel, SkeletonRows, Status, Tag } from '../components/ui.jsx';
import { ProgramListRow, RecommendationRecord } from '../components/domain.jsx';
import { total1000 } from '../lib/scores.js';
import { useSupabaseList, useSupabaseRecord, useSupabaseMutation } from '../lib/useSupabase.js';
import { toAnnouncement, toEvaluation, toProgram, toRecommendation, toRegistration } from '../lib/adapters.js';
import { useAuth } from '../lib/auth.jsx';
import { NotFound } from './public.jsx';

/* ---------- Student overview (prototype studentDashboard) ---------- */
export function StudentDashboard() {
  const { session } = useAuth();
  const firstName = session?.name ? session.name.split(' ')[0] : 'Student';
  const elevateMeId = session?.elevateMeId || 'Pending approval';
  const avatarUrl = session?.avatarUrl || session?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces";

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
  
  // Latest 3 evaluations that have actually been released to this student.
  const {
    data: recentEvalRows,
    loading: recentEvalsLoading,
  } = useSupabaseList({
    table: 'published_evaluations',
    select: '*',
    filters: {
      student_id: session?.userId || '00000000-0000-0000-0000-000000000000',
      released: true,
    },
    order: {
      col: 'released_at',
      ascending: false,
    },
    page: 1,
    pageSize: 3,
  });

  const recentEvalIds = (recentEvalRows || [])
    .map((evaluation) => evaluation.id)
    .filter(Boolean);

  const {
    data: recentScoreRows,
    loading: recentScoresLoading,
  } = useSupabaseList({
    table: 'published_evaluation_scores',
    filters: {
      evaluation_id:
        recentEvalIds.length > 0
          ? recentEvalIds
          : ['00000000-0000-0000-0000-000000000000'],
    },
    page: 1,
    pageSize: 30,
  });

  const recentScores = (recentEvalRows || []).map((evaluation) => {
    const scores = (recentScoreRows || [])
      .filter((score) => score.evaluation_id === evaluation.id)
      .map((score) => score.score ?? score.value);

    const result = total1000(scores);

    return {
      id: evaluation.id,
      programName: evaluation.program_title || 'Program',
      score: scores.length === 10 ? result.scaled : null,
      releasedAt: evaluation.released_at,
    };
  });

  // Calculate grade averages from score rows if available
  const criterionScoresMap = {};
  (recentScoreRows || []).forEach(s => {
    const key = (s.criterion_key ?? s.criterion ?? s.criterionKey ?? '').toLowerCase();
    const val = s.score ?? s.value;
    if (key && typeof val === 'number') {
      if (!criterionScoresMap[key]) criterionScoresMap[key] = [];
      criterionScoresMap[key].push(val);
    }
  });

  const getAvgCriterion = (keywords) => {
    let matchingScores = [];
    Object.keys(criterionScoresMap).forEach(k => {
      if (keywords.some(kw => k.includes(kw))) {
        matchingScores.push(...criterionScoresMap[k]);
      }
    });
    if (matchingScores.length === 0) return '—';
    const avg = Math.round(matchingScores.reduce((a, b) => a + b, 0) / matchingScores.length);
    return `${avg}%`;
  };

  const avgPreparation = getAvgCriterion(['prep', 'preparation']);
  const avgClarity = getAvgCriterion(['clarity', 'clear']);
  const avgConsistency = getAvgCriterion(['consistency', 'consistent']);
  const avgEngagement = getAvgCriterion(['engagement', 'engage', 'participation']);

  const regs = (regRows || []).map(toRegistration);
  const recs = (recRows || []).map(toRecommendation);
  const anns = (annRows || []).map(toAnnouncement);
  const highPriority = recs.filter((r) => r.priority === 'High priority').length;
  const activePrograms = regsLoading ? '02' : String(regCount ?? regs.length).padStart(2, '0');
  const recLabel = recsLoading ? '03' : String(recCount ?? recs.length).padStart(2, '0');
  const topRec = recs[0];
  const topAnn = anns[0];

  const validScores = recentScores.map(s => s.score).filter(s => s !== null);
  const overallTotalDisplay = validScores.length > 0 ? `${Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)}%` : 'See performance';

  // Landing page dark theme shared styling tokens
  const cardStyle = {
    background: 'var(--surface-card, #0f172a)',
    border: '1px solid var(--border, #1e293b)',
    borderRadius: '20px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
    padding: '24px',
    marginBottom: '20px',
  };

  const subCardStyle = {
    background: 'var(--surface-card-subtle, #1e293b)',
    border: '1px solid var(--border-subtle, #334155)',
    borderRadius: '16px',
    padding: '18px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  };

  return (
    <div style={{ color: 'var(--text-main, #f8fafc)' }}>
      {/* 1. Greeting & Avatar Card Header */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ font: '700 1.85rem/1.1 Manrope', margin: '0 0 6px', color: '#ffffff' }}>Good evening, {firstName}.</h1>
            <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.95rem' }}>Here is what is happening across your programs, performance and next steps.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#090d16', padding: '10px 16px', borderRadius: '14px', border: '1px solid #334155' }}>
            <img 
              src={avatarUrl} 
              alt="Student Avatar" 
              style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} 
            />
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>Student Profile</span>
              <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#ffffff' }}>{elevateMeId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Separated Core Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={subCardStyle}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ElevateMe ID</span>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, margin: '8px 0 4px', color: '#ffffff' }}>{elevateMeId}</p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Your permanent student ID</span>
        </div>

        <div style={subCardStyle}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overall Total</span>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399', margin: '8px 0 4px' }}>{overallTotalDisplay}</p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Released scores only</span>
        </div>

        <div style={subCardStyle}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Programs</span>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#818cf8', margin: '8px 0 4px' }}>{activePrograms}</p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{regs.length > 0 ? 'Across your registrations' : 'None yet'}</span>
        </div>

        <div style={subCardStyle}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommendations</span>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24', margin: '8px 0 4px' }}>{recLabel}</p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{highPriority > 0 ? `${highPriority} marked high priority` : 'None yet'}</span>
        </div>
      </div>

      {/* 3. Grade Averages Cards Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={subCardStyle}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Preparation</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '6px', color: '#ffffff' }}>{avgPreparation}</div>
        </div>

        <div style={subCardStyle}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Clarity</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '6px', color: '#ffffff' }}>{avgClarity}</div>
        </div>

        <div style={subCardStyle}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Consistency</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '6px', color: '#ffffff' }}>{avgConsistency}</div>
        </div>

        <div style={subCardStyle}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Engagement</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '6px', color: '#ffffff' }}>{avgEngagement}</div>
        </div>
      </div>

      {/* 4. Recent Scores Panel */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '16px' }}>Recent scores</h3>
        {recentEvalsLoading || recentScoresLoading ? (
          <SkeletonRows rows={3} />
        ) : recentScores.length === 0 ? (
          <Empty
            title="No released scores yet."
            body="Your recent scores will appear here once an evaluation is released."
          />
        ) : (
          <div className="flat-list">
            {recentScores.map((evaluation, index) => (
              <div
                key={evaluation.id}
                className="list-row compact"
                style={{
                  marginBottom:
                    index === 0 && recentScores.length > 1
                      ? '16px'
                      : 0,
                  borderRadius: '14px',
                  background: '#090d16',
                  border: '1px solid #334155',
                  padding: '12px 16px',
                }}
              >
                <div className="row-meta" style={{ color: '#94a3b8' }}>
                  {evaluation.releasedAt
                    ? new Date(evaluation.releasedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })
                    : 'Released'}
                </div>

                <div className="row-main">
                  <h3 style={{ color: '#ffffff' }}>{evaluation.programName}</h3>
                  <p style={{ color: '#94a3b8' }}>
                    {index === 0
                      ? 'Most recent evaluation'
                      : 'Released evaluation'}
                  </p>
                </div>

                <div className="row-action">
                  <strong
                    style={{
                      font: '700 1.15rem Manrope',
                      whiteSpace: 'nowrap',
                      color: '#ffffff',
                    }}
                  >
                    {evaluation.score == null
                      ? '—'
                      : `${evaluation.score} / 100`}
                  </strong>

                  <Link
                    to={`/student/performance/${evaluation.id}`}
                    className="button secondary small"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid dashboard" style={{ gap: '20px', marginBottom: '20px' }}>
        {regs.length > 0 ? (
          <section className="program-feature" style={{ ...subCardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span className="tag">Next session</span><h2 style={{ color: '#ffffff' }}>Your registration</h2><p style={{ color: '#94a3b8' }}>{regs[0].allocation || ''}<br />Registration {regs[0].status}</p></div>
            <Link to="/student/registrations" className="button">View event details →</Link>
          </section>
        ) : (
          <section style={subCardStyle}>
            <div className="panel-head"><h2 style={{ color: '#ffffff' }}>Next session</h2></div>
            <div className="panel-body"><Empty title="No registrations yet." body="Browse programs and register to see your next session here." /></div>
          </section>
        )}
        <section style={subCardStyle}>
          <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ color: '#ffffff' }}>Latest insight</h2><Status value="Improving" /></div>
          <div className="panel-body">
            <h3 style={{ font: '700 1.45rem/1.1 Manrope', margin: '0 0 13px', color: '#ffffff' }}>Confidence is moving in the right direction.</h3>
            <p style={{ color: '#94a3b8' }}>Your score rose in four consecutive evaluated sessions.</p>
            <Link to="/student/performance" className="button quiet">See performance →</Link>
          </div>
        </section>
      </div>

      <h2 className="section-title" style={{ color: '#ffffff', marginBottom: '16px' }}>What needs your attention</h2>
      <div className="flat-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="list-row compact" style={{ ...subCardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="row-meta" style={{ color: '#94a3b8' }}>Recommendation</div>
          {topRec ? (
            <div className="row-main"><h3 style={{ color: '#ffffff' }}>{topRec.title}</h3><p style={{ color: '#94a3b8' }}>{`Suggested by Diplomatic Impact · ${topRec.priority}`}</p></div>
          ) : (
            <div className="row-main"><h3 style={{ color: '#ffffff' }}>No recommendations yet</h3><p style={{ color: '#94a3b8' }}>Evaluator feedback will appear here.</p></div>
          )}
          <Link to="/student/recommendations" className="button secondary small">Review</Link>
        </div>
        <div className="list-row compact" style={{ ...subCardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="row-meta" style={{ color: '#94a3b8' }}>Announcement</div>
          {topAnn ? (
            <div className="row-main"><h3 style={{ color: '#ffffff' }}>{topAnn.title}</h3><p style={{ color: '#94a3b8' }}>{`${topAnn.title} · Published`}</p></div>
          ) : (
            <div className="row-main"><h3 style={{ color: '#ffffff' }}>No announcements</h3><p style={{ color: '#94a3b8' }}>Published updates will appear here.</p></div>
          )}
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
    if (p.status !== 'Published' && p.status !== 'InProgress' && p.status !== 'Approved') return false;
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
  return <div><PageHead kicker="Performance" title="Your progress." desc="Scores and automated insights from released evaluations." />
    <ReleasedPerformance studentId={session?.userId} studentLinks />
  </div>;
}

export function EvaluationDetail() {
  const { evaluationId } = useParams();
  const { data: row, loading, error } = useSupabaseRecord({ table: 'published_evaluations', id: evaluationId });
  const { data: scoreRows, loading: scoresLoading, error: scoresError } = useSupabaseList({
    table: 'published_evaluation_scores',
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

  if (loading) return <div><PageHead kicker="Updates" title="Announcements." desc="Important notices from Diplomatic Impact and your programmes." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Updates" title="Announcements." desc="Important notices from Diplomatic Impact and your programmes." /><div className="notice"><strong>Couldn’t load announcements.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Updates" title="Announcements." desc="Important notices from Diplomatic Impact and your programmes." />
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

/* ---------- Profile (Supabase-backed) ---------- */
export function StudentProfile() {
  const { session } = useAuth();
  const { data: profile } = useSupabaseRecord({ table: 'profiles', id: session?.userId });
  const fullName = profile?.full_name || session?.name || '';
  const emId = profile?.elevate_me_id || session?.elevateMeId || 'Pending approval';
  const email = profile?.email || session?.email || '';
  const status = profile?.status || session?.status || 'PendingReview';
  return (
    <div>
      <PageHead kicker="Account" title="Your profile." desc="Keep your student and contact information accurate." />
      <section className="panel">
        <div className="panel-head"><h2>Student details</h2><Status value={status} /></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Full name<input defaultValue={fullName} key={fullName} /></label></div>
          <div className="field"><label>ElevateMe ID<input defaultValue={emId} disabled /></label></div>
          <div className="field"><label>Institute<input defaultValue={profile?.institute || ''} key={profile?.institute || 'inst'} /></label></div>
          <div className="field"><label>Email<input defaultValue={email} type="email" /></label></div>
          <div className="field"><label>Telephone<input defaultValue={profile?.phone || ''} key={profile?.phone || 'phone'} /></label></div>
          <div className="field"><label>Date of birth<input defaultValue={profile?.dob || ''} key={profile?.dob || 'dob'} type="date" /></label></div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Kept extras ---------- */
export function StudentDevelopment() {
  const { data: programRows } = useSupabaseList({ table: 'programs', page: 1, pageSize: 5 });
  const programs = (programRows || []).map(toProgram).filter((p) => p.status === 'Published' || p.status === 'InProgress' || p.status === 'Approved');
  const suggestion = programs[0];
  return (
    <div>
      <PageHead kicker="Development" title="Further development." desc="Follow-on programs matched to your insights." />
      <div className="grid two">
        {suggestion ? (
          <Panel title="Suggested next" action={<Tag>{suggestion.typeLabel || suggestion.category || 'Program'}</Tag>}>
            <p style={{ color: 'var(--muted)', fontSize: '.92rem' }}>{suggestion.title}. {suggestion.meta || ''}</p>
            <div style={{ marginTop: 12 }}><Link to={`/student/programs/${suggestion.id}`} className="button small">View program →</Link></div>
          </Panel>
        ) : (
          <Panel title="Suggested next" action={<Tag>No programs</Tag>}>
            <div className="panel-body"><Empty title="No programs published yet." body="Follow-on programs will be suggested here." /></div>
          </Panel>
        )}
        <Empty title="No enrolments yet" body="Completed development actions will be tracked here." />
      </div>
    </div>
  );
}

export function StudentParentAccess() {
  const { session } = useAuth();
  const { data: linkRows } = useSupabaseList({
    table: 'parent_links',
    filters: session?.userId ? { student_id: session.userId } : {},
    page: 1,
    pageSize: 5,
  });
  const { data: profileRows } = useSupabaseList({ table: 'profiles', page: 1, pageSize: 50 });
  const links = linkRows || [];
  const nameById = new Map((profileRows || []).map(toProfile).map((p) => [p.userId || p.id, p]));
  return (
    <div>
      <PageHead kicker="Family" title="Parent access." desc="Invite a parent via time-limited invitation — never open ID lookup." />
      {links.length > 0 ? (
        links.map((l) => {
          const p = nameById.get(l.parent_id);
          return (
            <Panel key={l.parent_id || l.id} title="Linked parent" action={<Status value={l.status || 'Pending'} />}>
              <p style={{ fontSize: '.92rem' }}>{p?.name || 'Parent'}{p?.email ? ` · ${p.email}` : ''} · sees same released data as student.</p>
            </Panel>
          );
        })
      ) : (
        <Panel title="Linked parent" action={<Status value="None" />}>
          <div className="panel-body"><Empty title="No parent linked." body="Issue an invitation to link a parent account." /></div>
        </Panel>
      )}
    </div>
  );
}