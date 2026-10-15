import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, PageHead, SkeletonRows } from '../components/ui.jsx';
import { ProgramListRow } from '../components/domain.jsx';
import { useSupabaseList } from '../lib/useSupabase.js';
import { toProgram } from '../lib/adapters.js';
import { useAuth } from '../lib/auth.jsx';

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------- Teacher / programme coordinator overview ---------- */
export function TeacherOverview() {
  const { session } = useAuth();
  const firstName = (session?.name || 'there').split(' ')[0];
  return (
    <div>
      <section className="welcome-card">
        <div className="welcome-avatar" aria-hidden="true"><span>{initialsFor(session?.name)}</span></div>
        <div className="welcome-text">
          <div className="page-kicker">Teacher / Programme Coordinator</div>
          <h1 className="page-title">Welcome, {firstName}.</h1>
          <p className="page-description">Your account is ready. Browse the programs running on ElevateMe below.</p>
        </div>
        <Link to="/teacher/programs" className="button pill">Browse programs <span className="pill-arrow" aria-hidden="true">↗</span></Link>
      </section>
      <div className="notice" style={{ marginTop: 22 }}>
        <strong>Coordinator tools are not switched on yet.</strong> Managing programs, rosters and results is done by DI admins for now.
        Contact a Diplomatic Impact administrator if you need access to something for your students.
      </div>
    </div>
  );
}

/* ---------- Published programs (read-only) ---------- */
export function TeacherPrograms() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useSupabaseList({
    table: 'programs',
    search: q ? { col: 'title', term: q } : null,
    order: { col: 'start_date', ascending: true },
    page: 1,
    pageSize: 20,
  });
  const programs = (data || []).map(toProgram).filter((p) => p.status === 'Published' || p.status === 'InProgress' || p.status === 'Approved');
  return (
    <div>
      <PageHead kicker="Programs" title="Programs on ElevateMe." desc="Approved events and continuous programs your students can join." />
      <div className="filter-bar">
        <input type="search" placeholder="Search programs" aria-label="Search programs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load programs.</strong> {error.message}</div>}
      {!loading && !error && (
        <div className="flat-list card-grid">
          {programs.length === 0 && <Empty title="No programs found." body="Try another search." />}
          {programs.map((p) => (
            <ProgramListRow key={p.id} date={p.date} type={p.typeLabel} title={p.title} meta={p.meta}
              status={(p.registered ?? 0) >= (p.capacity ?? 0) ? 'RegistrationClosed' : 'Open'}
              linkTo={`/programs/${p.id}`} actionLabel="View program →" />
          ))}
        </div>
      )}
    </div>
  );
}