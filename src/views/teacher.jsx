import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, Metrics, PageHead, SkeletonRows, Status } from '../components/ui.jsx';
import { useSupabaseList } from '../lib/useSupabase.js';
import { supabase } from '../lib/supabaseClient.js';
import { toProgram } from '../lib/adapters.js';
import { useAuth } from '../lib/auth.jsx';

const TOOLS = [
  ['Create a program', 'Build a program with its sessions and capacity.', '/teacher/programs/new'],
  ['Programs', 'Edit, submit and publish programs; confirm registrations.', '/teacher/programs'],
  ['Students', 'See the students enrolled in your programs.', '/teacher/students'],
  ['Evaluator access', 'Invite evaluators with private 24-hour links.', '/teacher/evaluator-invitations'],
  ['Evaluation review', 'Review submitted reports and release results.', '/teacher/evaluations'],
];

export function TeacherOverview() {
  const { session } = useAuth();
  const firstName = (session?.name || '').trim().split(/\s+/)[0] || 'there';
  const { count: programCount } = useSupabaseList({ table: 'programs', page: 1, pageSize: 1 });
  const { count: studentCount } = useSupabaseList({ table: 'profiles', contains: { col: 'roles', values: ['student'] }, page: 1, pageSize: 1 });
  const { count: awaitingRelease } = useSupabaseList({ table: 'evaluations', filters: { released: false }, page: 1, pageSize: 1 });
  const { count: releasedCount } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 1 });
  const pad = (n) => String(n ?? 0).padStart(2, '0');

  return (
    <div>
      <section className="welcome-card">
        <div className="welcome-text">
          <div className="page-kicker">Teacher / Programme Coordinator</div>
          <h1 className="page-title">Welcome, {firstName}.</h1>
          <p className="page-description">Create programs, run evaluations and release results to your students.</p>
        </div>
        <Link to="/teacher/programs/new" className="button pill">Create a program <span className="pill-arrow" aria-hidden="true">↗</span></Link>
      </section>
      <Metrics className="metric-cards" items={[
        ['Your programs', pad(programCount), 'Created by you'],
        ['Enrolled students', pad(studentCount), 'In your programs'],
        ['Awaiting release', pad(awaitingRelease), 'Unreleased evaluations'],
        ['Released', pad(releasedCount), 'Reports shared with students'],
      ]} />
      <section className="panel">
        <div className="panel-head"><h2>Your tools</h2></div>
        <div className="panel-body">
          <div className="flat-list card-grid">
            {TOOLS.map(([title, body, to]) => (
              <article key={to} className="list-row">
                <div className="row-main"><h3>{title}</h3><p>{body}</p></div>
                <div className="row-action"><Link to={to} className="button secondary small">Open</Link></div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function TeacherPrograms() {
  const { session } = useAuth();
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const { data, loading, error, refetch } = useSupabaseList({
    table: 'programs',
    search: q ? { col: 'title', term: q } : null,
    order: { col: 'start_date', ascending: true },
    page: 1,
    pageSize: 50,
  });
  const rows = data || [];
  const ownerOf = Object.fromEntries(rows.map((r) => [r.id, r.created_by]));
  const programs = rows.filter((r) => r.created_by === session?.userId).map(toProgram);
  const mine = (p) => Boolean(ownerOf[p.id]) && ownerOf[p.id] === session?.userId;

  // Moves your own program through review -> approved -> published.
  const move = async (p, decision) => {
    try {
      const { error: rpcError } = await supabase.rpc('approve_program', { p_program_id: p.id, p_decision: decision, p_note: null });
      if (rpcError) throw new Error(rpcError.message);
      setToast(`${p.title}: ${decision}.`);
      refetch?.();
    } catch (err) {
      setToast(err?.message || 'Could not update the program.');
    }
  };

  return (
    <div>
      <PageHead kicker="Teacher / Programme Coordinator" title="Programs."
        desc="Create your programs, submit and publish them, and manage registrations."
                action={<Link className="button go" to="/teacher/programs/new">Create program</Link>} />
      <div className="filter-bar">
        <input type="search" placeholder="Search programs" aria-label="Search programs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {toast && <div className="notice" role="status">{toast}</div>}
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load programs.</strong> {error.message}</div>}
      {!loading && !error && (
        <div className="flat-list card-grid">
          {programs.length === 0 && <Empty title="No programs yet." body="Create your first program to get started." />}
          {programs.map((p) => (
            <article key={p.id} className="list-row">
              <div className="row-meta">{p.date}<br />{p.typeLabel}</div>
              <div className="row-main"><h3>{p.title}</h3><p>{p.meta} · {p.registered}/{p.capacity} registered</p></div>
              <div className="row-action" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Status value={p.status} />
                                {mine(p) && (p.status === 'Submitted' || p.status === 'UnderReview') && (
                  <button type="button" className="button small go" onClick={() => move(p, 'Approved')}>Approve</button>
                )}
                {mine(p) && p.status === 'Approved' && (
                  <button type="button" className="button small go" onClick={() => move(p, 'Published')}>Publish</button>
                )}
                <Link to={`/teacher/programs/${p.id}`} className="button secondary small">Manage</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}