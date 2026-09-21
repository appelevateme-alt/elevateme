import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, Empty, Metrics, PageHead, Panel, SkeletonRows, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList } from '../components/domain.jsx';
import { useSupabaseList, useSupabaseMutation } from '../lib/useSupabase.js';
import { TEN_CRITERIA } from '../lib/scores.js';
import { supabase } from '../lib/supabaseClient.js';
import { toAnnouncement, toProfile, toProgram, toRecommendation, toThread } from '../lib/adapters.js';

/* ---------- Platform overview (Supabase-backed counts) ---------- */
export function AdminOverview() {
  const { count: pendingPrograms } = useSupabaseList({ table: 'programs', filters: { status: 'UnderReview' }, page: 1, pageSize: 1 });
  const { count: pendingUsers } = useSupabaseList({ table: 'profiles', filters: { status: 'PendingReview' }, page: 1, pageSize: 1 });
  const { count: activePrograms } = useSupabaseList({ table: 'programs', filters: { status: 'Published' }, page: 1, pageSize: 1 });
  const { count: studentCount } = useSupabaseList({ table: 'profiles', contains: { col: 'roles', values: ['student'] }, page: 1, pageSize: 1 });
  const { count: awaitingRelease } = useSupabaseList({ table: 'evaluations', filters: { released: false }, page: 1, pageSize: 1 });
  const { count: releasedCount } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 1 });
  const pendingTotal = (pendingPrograms ?? 0) + (pendingUsers ?? 0);

  return (
    <div>
      <PageHead kicker="Diplomatic Impact" title="Platform overview." desc="Approvals, evaluations and development actions that need attention."
        action={<Link to="/admin/approvals" className="button">Open approval queue →</Link>} />
      <Metrics items={[
        ['Pending approvals', String(pendingTotal).padStart(2, '0'), `${pendingUsers} user · ${pendingPrograms} program`],
        ['Active programs', String(activePrograms).padStart(2, '0'), 'Published in directory'],
        ['Students', String(studentCount).padStart(2, '0'), 'Across all roles'],
        ['Evaluations', String(awaitingRelease).padStart(2, '0'), `${releasedCount} released`],
      ]} />
      <div className="grid dashboard">
        <section className="panel">
          <div className="panel-head"><h2>Approval queue</h2><Link to="/admin/approvals" className="button quiet small">View all →</Link></div>
          <div className="panel-body"><div className="flat-list">
            {pendingTotal > 0 ? (
              <div className="list-row compact"><div className="row-meta">QUEUE</div><div className="row-main"><h3>{pendingTotal} item{pendingTotal === 1 ? '' : 's'} waiting</h3><p>Programs and accounts awaiting review</p></div><Status value="Review" /></div>
            ) : (
              <div className="list-row compact"><div className="row-meta">QUEUE</div><div className="row-main"><h3>Queue is clear</h3><p>New submissions will appear here</p></div><Status value="Clear" /></div>
            )}
          </div></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Platform health</h2></div>
          <div className="panel-body">
            <InsightList items={[
              { label: 'Completion', text: `${releasedCount} of ${releasedCount + awaitingRelease} evaluation sheets released.` },
              { label: 'Approval', text: pendingTotal === 0 ? 'Approval queue is clear.' : `${pendingTotal} items waiting for review.` },
              { label: 'Growth', text: `${studentCount} student accounts on the platform.` },
            ]} />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Approval queue (Supabase-backed review) ---------- */
export function AdminApprovals() {
  const [decided, setDecided] = useState({});
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const [typeFilter, setTypeFilter] = useState('All request types');
  const [statusFilter, setStatusFilter] = useState('Pending review');

  const { data: progRows, refetch: refetchProgs } = useSupabaseList({ table: 'programs', filters: { status: 'UnderReview' }, page: 1, pageSize: 10 });
  const { data: userRows, refetch: refetchUsers } = useSupabaseList({ table: 'profiles', filters: { status: 'PendingReview' }, page: 1, pageSize: 10 });
  const { data: evalRows, refetch: refetchEvals } = useSupabaseList({ table: 'evaluations', filters: { released: false }, page: 1, pageSize: 10 });

  const programs = (progRows || []).map(toProgram);
  const users = (userRows || []).map(toProfile);

  // All decisions go through the audited RPCs (approve_program,
  // decide_profile, release_evaluations) — never direct updates — so every
  // outcome is state-checked server-side and written to audit_log.
  const decideProgram = async (id, label) => {
    if ((label === 'Request changes' || label === 'Reject') && !note.trim()) {
      setToast('A note is required for Request changes and Reject.');
      return;
    }
    try {
      const decision = label === 'Approve' ? 'Approved' : label === 'Reject' ? 'Rejected' : 'ChangesRequested';
      const { error } = await supabase.rpc('approve_program', { p_program_id: id, p_decision: decision, p_note: note.trim() || null });
      if (error) throw new Error(error.message);
      setDecided((d) => ({ ...d, [id]: decision }));
      setToast(`${label} recorded — audit entry created.`);
      refetchProgs?.();
    } catch (err) {
      setToast(err?.message || 'Could not record decision.');
    }
  };

  const decideUser = async (id, label) => {
    if ((label === 'Request changes' || label === 'Reject') && !note.trim()) {
      setToast('A note is required for Request changes and Reject.');
      return;
    }
    try {
      const decision = label === 'Approve' ? 'Approved' : label === 'Reject' ? 'Rejected' : 'ChangesRequested';
      const { error } = await supabase.rpc('decide_profile', { p_profile_id: id, p_decision: decision, p_note: note.trim() || null });
      if (error) throw new Error(error.message);
      setDecided((d) => ({ ...d, [id]: decision }));
      setToast(`${label} recorded — audit entry created.${decision === 'Approved' ? ' ElevateMe ID assigned for students.' : ''}`);
      refetchUsers?.();
    } catch (err) {
      setToast(err?.message || 'Could not record decision.');
    }
  };

  const decideRelease = async (ids, label) => {
    if ((label === 'Request changes' || label === 'Reject') && !note.trim()) {
      setToast('A note is required for Request changes and Reject.');
      return;
    }
    try {
      if (label === 'Approve') {
        // Release is per session (locks Submitted sheets, stamps released_at).
        const wanted = new Set(ids || []);
        const sessionIds = [...new Set((evalRows || [])
          .filter((e) => wanted.size === 0 || wanted.has(e.id))
          .map((e) => e.session_id)
          .filter(Boolean))];
        if (sessionIds.length === 0) throw new Error('No sessions to release.');
        let total = 0;
        for (const sid of sessionIds) {
          const { data, error } = await supabase.rpc('release_evaluations', { p_session_id: sid });
          if (error) throw new Error(error.message);
          total += data || 0;
        }
        setDecided((d) => ({ ...d, release: 'Approved' }));
        setToast(`Released ${total} evaluation${total === 1 ? '' : 's'} — audit entry created.`);
      } else {
        setDecided((d) => ({ ...d, release: 'ChangesRequested' }));
        setToast('Request changes recorded.');
      }
      refetchEvals?.();
    } catch (err) {
      setToast(err?.message || 'Could not record decision.');
    }
  };

  const showPrograms = typeFilter === 'All request types' || typeFilter === 'Program';
  const showUsers = typeFilter === 'All request types' || typeFilter === 'User account';
  const showReleases = typeFilter === 'All request types' || typeFilter === 'Evaluation release';

  const progItems = showPrograms ? programs.map((p) => ([
    p.startDate || '—',
    <span key={`t-${p.id}`}><strong>{p.title}</strong><br />{p.typeLabel}</span>,
    'Coordinator',
    p.institute,
    <Status key={`s-${p.id}`} value={decided[p.id] || 'Pending review'} />,
      <span key={`a-${p.id}`} style={{ display: 'flex', gap: 6 }}>
        <Button small disabled={!!decided[p.id]} onClick={() => decideProgram(p.id, 'Approve')}>Approve</Button>
        <Button small variant="secondary" disabled={!!decided[p.id]} onClick={() => decideProgram(p.id, 'Request changes')}>Changes</Button>
      </span>,
  ])) : [];
  const userItems = showUsers ? users.map((u, i) => {
    const uid = u.userId || u.id;
    const roleLabel = u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Account';
    return ([
      '—',
      <span key={`u-${uid || i}`}><strong>{roleLabel} account</strong><br />{u.name}</span>,
      u.email || 'Self registration',
      '—',
      <Status key={`us-${uid || i}`} value={decided[uid] || u.status || 'Pending review'} />,
      <span key={`ua-${uid || i}`} style={{ display: 'flex', gap: 6 }}>
        <Button small disabled={!!decided[uid]} onClick={() => decideUser(uid, 'Approve')}>Approve</Button>
        <Button small variant="secondary" disabled={!!decided[uid]} onClick={() => decideUser(uid, 'Request changes')}>Changes</Button>
      </span>,
    ]);
  }) : [];
  const releaseIds = (evalRows || []).map((e) => e.id);
  const releaseItems = showReleases && releaseIds.length > 0 ? [[
    '—',
    <span key="t-e"><strong>Session results</strong><br />{`${releaseIds.length} evaluations`}</span>,
    'Evaluator',
    '—',
    <Status key="s-e" value={decided.release || 'Ready to release'} />,
      <span key="a-e" style={{ display: 'flex', gap: 6 }}>
        <Button small disabled={!!decided.release} onClick={() => decideRelease(releaseIds, 'Approve')}>Approve</Button>
        <Button small variant="secondary" disabled={!!decided.release} onClick={() => decideRelease(releaseIds, 'Request changes')}>Changes</Button>
      </span>,
  ]] : [];

  const liveRows = [...progItems, ...userItems, ...releaseItems];

  void statusFilter;

  return (
    <div>
      <PageHead kicker="Administration" title="Approval queue." desc="Review access requests, programs and result releases with a clear audit trail." />
      <div className="filter-bar">
        <select aria-label="Request type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option>All request types</option><option>Program</option><option>User account</option><option>Evaluation release</option></select>
        <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>Pending review</option><option>Changes requested</option><option>Approved</option></select>
      </div>
      <div className="field" style={{ marginBottom: 18 }}>
        <label>Review note (required for Request changes / Reject)
          <input placeholder="e.g. Add venue and capacity before approval" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} />
        </label>
      </div>
      {liveRows.length > 0 ? (
        <DataTable headers={['Submitted', 'Request', 'Submitted by', 'Institute', 'Status', '']} rows={liveRows} />
      ) : (
        <Empty title="Queue is clear." body="New program submissions, account requests, and releases will appear here." />
      )}
      {toast && <div role="status" className="toast show">{toast}</div>}
    </div>
  );
}

/* ---------- All programs (Supabase-backed) ---------- */
export function AdminPrograms() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useSupabaseList({
    table: 'programs',
    search: q ? { col: 'title', term: q } : null,
    order: { col: 'start_date', ascending: true },
    page: 1,
    pageSize: 20,
  });
  const programs = (data || []).map(toProgram);
  return (
    <div>
      <PageHead kicker="Administration" title="All programs." desc="Monitor every program from draft through publication and completion."
        action={<Button variant="secondary">Export report</Button>} />
      <div className="filter-bar">
        <input type="search" placeholder="Search programs" aria-label="Search programs" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Type"><option>All program types</option></select>
        <select aria-label="Status"><option>All statuses</option></select>
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load programs.</strong> {error.message}</div>}
      {!loading && !error && (
        <div className="flat-list">
          {programs.length === 0 && <Empty title="No programs found." body="Try another search." />}
          {programs.map((p) => (
            <article key={p.id} className="list-row">
              <div className="row-meta">{p.date}<br />{p.typeLabel}</div>
              <div className="row-main"><h3>{p.title}</h3><p>{p.meta} · {p.registered}/{p.capacity} registered</p></div>
              <div className="row-action"><Status value={p.status} /><Link to={`/coordinator/programs/${p.id}`} className="button secondary small">Manage</Link></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Users & institutes (Supabase-backed) ---------- */
const ROLE_FILTERS = {
  Student: { col: 'roles', values: ['student'] },
  Parent: { col: 'roles', values: ['parent'] },
  Coordinator: { col: 'roles', values: ['coordinator'] },
  Evaluator: { col: 'roles', values: ['evaluator'] },
};
export function AdminUsers() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All roles');
  const { data, loading, error } = useSupabaseList({
    table: 'profiles',
    search: q ? { col: 'full_name', term: q } : null,
    contains: ROLE_FILTERS[role] || null,
    page: 1,
    pageSize: 20,
  });
  const { count: studentCount } = useSupabaseList({ table: 'profiles', contains: { col: 'roles', values: ['student'] }, page: 1, pageSize: 1 });
  const { count: parentCount } = useSupabaseList({ table: 'profiles', contains: { col: 'roles', values: ['parent'] }, page: 1, pageSize: 1 });
  const { count: coordinatorCount } = useSupabaseList({ table: 'profiles', contains: { col: 'roles', values: ['coordinator'] }, page: 1, pageSize: 1 });
  const { count: evaluatorCount } = useSupabaseList({ table: 'profiles', contains: { col: 'roles', values: ['evaluator'] }, page: 1, pageSize: 1 });
  const { count: pendingStudents } = useSupabaseList({ table: 'profiles', filters: { status: 'PendingReview' }, contains: { col: 'roles', values: ['student'] }, page: 1, pageSize: 1 });
  const { count: linkCount } = useSupabaseList({ table: 'parent_links', page: 1, pageSize: 1 });
  const { count: assignmentCount } = useSupabaseList({ table: 'program_evaluators', page: 1, pageSize: 1 });
  const users = (data || []).map(toProfile);
  const [roleMsg, setRoleMsg] = useState('');
  const changeRole = async (uid, newRole) => {
    if (!newRole) return;
    setRoleMsg('');
    try {
      const { error } = await supabase.rpc('set_profile_roles', { p_profile_id: uid, p_roles: [newRole], p_active_role: newRole });
      if (error) throw new Error(error.message);
      setRoleMsg(`Role updated — audit entry created.`);
    } catch (err) {
      setRoleMsg(err?.message || 'Could not update role.');
    }
  };
  return (
    <div>
      <PageHead kicker="Administration" title="Users & institutes." desc="Manage approved access while protecting student and institutional data." />
      <Metrics items={[
        ['Students', String(studentCount).padStart(2, '0'), `${pendingStudents} pending verification`],
        ['Parents', String(parentCount).padStart(2, '0'), `${linkCount} active links`],
        ['Coordinators', String(coordinatorCount).padStart(2, '0'), 'Manage programs'],
        ['Evaluators', String(evaluatorCount).padStart(2, '0'), `${assignmentCount} currently assigned`],
      ]} />
      <div className="filter-bar">
        <input type="search" placeholder="Search name, email or ElevateMe ID" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}><option>All roles</option><option>Student</option><option>Parent</option><option>Coordinator</option><option>Evaluator</option></select>
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load users.</strong> {error.message}</div>}
      {!loading && !error && (
        <>
          {roleMsg && <p role="status" className="notice" style={{ marginBottom: 12 }}>{roleMsg}</p>}
          <DataTable headers={['User', 'Role', 'Institute', 'Joined', 'Status']}
            rows={users.map((s) => [
              <span key="u"><strong>{s.name}</strong><br /><span className="row-meta">{s.elevateMeId}</span></span>,
              <select key={`r-${s.userId}`} aria-label={`Role for ${s.name}`} value={s.role || ''} onChange={(e) => changeRole(s.userId, e.target.value)}>
                <option value="">—</option>
                <option value="student">Student</option>
                <option value="parent">Parent</option>
                <option value="coordinator">Coordinator</option>
                <option value="evaluator">Evaluator</option>
                <option value="admin">Admin</option>
              </select>,
              s.institute || '—', s.joined || '—', <Status key="s" value={s.status || 'Approved'} />,
            ])} />
        </>
      )}
    </div>
  );
}

export function AdminInstitutes() {
  const { data, loading, error } = useSupabaseList({ table: 'institutes', page: 1, pageSize: 20 });
  const items = data || [];
  if (loading) return <div><PageHead kicker="Administration" title="Institutes." desc="Verification state per institute. Coordinators attach at signup." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Administration" title="Institutes." desc="Verification state per institute. Coordinators attach at signup." /><div className="notice"><strong>Couldn’t load institutes.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Administration" title="Institutes." desc="Verification state per institute. Coordinators attach at signup." />
      <Panel title="All institutes" action={<Tag>{items.length} records</Tag>}>
        <DataTable headers={['Institute', 'Verified']}
          rows={items.map((x) => [x.name, x.verified ? 'Yes' : 'No'])} />
      </Panel>
    </div>
  );
}

/* ---------- Evaluations (Supabase-backed release via audited RPC) ---------- */
export function AdminEvaluations() {
  const { data: awaitingRows, loading, error, refetch } = useSupabaseList({ table: 'evaluations', filters: { released: false }, page: 1, pageSize: 20 });
  const { data: releasedRows } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 20 });
  const { data: sessionRows } = useSupabaseList({ table: 'sessions', page: 1, pageSize: 50 });
  const { data: programRows } = useSupabaseList({ table: 'programs', page: 1, pageSize: 50 });
  const { data: profileRows } = useSupabaseList({ table: 'profiles', page: 1, pageSize: 100 });
  const [released, setReleased] = useState(false);
  const [busy, setBusy] = useState(false);
  const [releaseError, setReleaseError] = useState('');
  const awaiting = awaitingRows || [];
  const releasedList = releasedRows || [];
  const sessionById = new Map((sessionRows || []).map((s) => [s.id, s]));
  const programById = new Map((programRows || []).map((p) => [p.id, p]));
  const nameById = new Map((profileRows || []).map(toProfile).map((p) => [p.userId, p.name]));
  const evalRow = (e, isReleased) => {
    const s = sessionById.get(e.session_id);
    const p = programById.get(e.program_id);
    return [
      <span key={`t-${e.id}`}><strong>{p?.title || 'Program'}</strong><br />{s?.title || 'Session'}</span>,
      nameById.get(e.evaluator_id) || 'Evaluator',
      e.state || (isReleased ? 'Locked' : 'Submitted'),
      e.updated_at ? String(e.updated_at).slice(0, 10) : '—',
      <Status key={`s-${e.id}`} value={isReleased ? 'Released' : 'Ready to release'} />,
      !isReleased && !released
        ? <Button key={`b-${e.id}`} small disabled={busy} onClick={releaseAll}>{busy ? 'Releasing…' : 'Release'}</Button>
        : <Button key={`b-${e.id}`} variant="secondary" small>View</Button>,
    ];
  };
  const tableRows = [...awaiting.map((e) => evalRow(e, false)), ...releasedList.map((e) => evalRow(e, true))];

  const releaseAll = async () => {
    setReleaseError('');
    setBusy(true);
    try {
      // Per session: locks Submitted sheets, stamps released_at, audits.
      const sessionIds = [...new Set(awaiting.map((e) => e.session_id).filter(Boolean))];
      if (sessionIds.length === 0) throw new Error('No sessions to release.');
      let total = 0;
      for (const sid of sessionIds) {
        const { data, error: rpcError } = await supabase.rpc('release_evaluations', { p_session_id: sid });
        if (rpcError) throw new Error(rpcError.message);
        total += data || 0;
      }
      setReleased(true);
      refetch?.();
    } catch (err) {
      setReleaseError(err?.message || 'Could not release evaluations.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div><PageHead kicker="Administration" title="Evaluations." desc="Review submission progress and control when results become visible." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Administration" title="Evaluations." desc="Review submission progress and control when results become visible." /><div className="notice"><strong>Couldn’t load evaluations.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Administration" title="Evaluations." desc="Review submission progress and control when results become visible." />
      <div className="filter-bar">
        <select aria-label="Program"><option>All programs</option></select>
        <select aria-label="Status"><option>Awaiting release</option><option>Submitted</option><option>Released</option></select>
      </div>
      {tableRows.length > 0 ? (
        <DataTable headers={['Program / session', 'Evaluator', 'State', 'Updated', 'Status', '']} rows={tableRows} />
      ) : (
        <Empty title="No evaluations yet." body="Submitted sheets will appear here for release." />
      )}
      {releaseError && <p role="alert" className="field-error" style={{ marginTop: 12 }}>{releaseError}</p>}
      {released && <div className="notice" style={{ marginTop: 18 }}><strong>{awaiting.length} results released.</strong> Students and linked parents can now see them. Audit entry created.</div>}
    </div>
  );
}

/* ---------- Reports / config / audit ---------- */
export function AdminReports() {
  const { data: programRows } = useSupabaseList({ table: 'programs', page: 1, pageSize: 50 });
  const { data: sessionRows } = useSupabaseList({ table: 'sessions', page: 1, pageSize: 100 });
  const { data: evalRows } = useSupabaseList({ table: 'evaluations', page: 1, pageSize: 200 });
  const { data: scoreRows } = useSupabaseList({ table: 'evaluation_scores', page: 1, pageSize: 500 });
  const programs = (programRows || []).map(toProgram);
  const sessions = (sessionRows || []).map(toSession);
  const evals = evalRows || [];
  const releasedIds = new Set(evals.filter((e) => e.released).map((e) => e.id));
  const releasedScores = (scoreRows || []).filter((s) => releasedIds.has(s.evaluation_id));
  const avgByCriterion = TEN_CRITERIA.map((c) => {
    const vals = releasedScores
      .filter((s) => s.criterion_key === c.key)
      .map((s) => Number(s.score))
      .filter((n) => Number.isFinite(n));
    return [c.label, vals.length > 0 ? String(Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10) : '—'];
  });
  const completionRows = sessions.map((s) => {
    const mine = evals.filter((e) => (e.session_id ?? e.sessionId) === s.id);
    const done = mine.filter((e) => e.state === 'Submitted' || e.state === 'Locked' || e.released).length;
    return [s.title, String(mine.length), String(done)];
  });
  return (
    <div>
      <PageHead kicker="Administration" title="Reports." desc="Pilot trio: registrations · evaluation completion · average by criterion." action={<Button variant="secondary">Export CSV</Button>} />
      <div className="grid two">
        <Panel title="Registrations by program" action={<Tag>{programs.length} programs</Tag>}>
          {programs.length > 0 ? (
            <DataTable headers={['Program', 'Registered', 'Capacity']} rows={programs.map((p) => [p.title, String(p.registered ?? 0), String(p.capacity ?? 0)])} />
          ) : (
            <Empty title="No programs yet." body="Registration figures appear once programs exist." />
          )}
        </Panel>
        <Panel title="Evaluation completion" action={<Tag>{completionRows.length} sessions</Tag>}>
          {completionRows.length > 0 ? (
            <DataTable headers={['Session', 'Assigned', 'Submitted']} rows={completionRows} />
          ) : (
            <Empty title="No sessions yet." body="Completion figures appear once sessions exist." />
          )}
        </Panel>
      </div>
      <div style={{ height: 22 }} />
      <Panel title="Average by criterion" action={<Tag>Released only</Tag>}>
        {releasedScores.length > 0 ? (
          <DataTable headers={['Criterion', 'Average / 100']} rows={avgByCriterion} />
        ) : (
          <Empty title="No released scores yet." body="Averages appear once evaluations are released." />
        )}
      </Panel>
    </div>
  );
}

export function AdminConfig() {
  const { data } = useSupabaseList({ table: 'evaluation_templates', page: 1, pageSize: 1 });
  const template = (data || [])[0];
  const criteria = ['Preparation', 'Clarity', 'Confidence', 'Focus', 'Critical Analysis', 'Vocal Delivery', 'Audience Addressing', 'Counter Arguments', 'Wit', 'Overall Performance'];
  return (
    <div>
      <PageHead kicker="Administration" title="Configuration." desc="Program types, criteria, rubrics — all versioned. History keeps its original rubric." />
      <Panel title={template?.name || 'Evaluation template v1'} action={<Tag>10 criteria · 1000-point sheet</Tag>}>
        <div className="grid two">
          {criteria.map((c) => (
            <div key={c} style={{ border: '1px solid var(--line)', padding: '10px 14px', fontSize: '.88rem' }}><strong>{c}</strong></div>
          ))}
        </div>
        <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 12 }}>Scale: each criterion 0–100 · sheet total out of 1000 · final score total ÷ 10, out of 100.</p>
      </Panel>
    </div>
  );
}

export function AdminAudit() {
  const { data, loading, error } = useSupabaseList({ table: 'audit_log', order: { col: 'created_at', ascending: false }, page: 1, pageSize: 20 });
  const rows = (data || []).map((e) => [e.created_at || e.time || '—', e.actor || e.actor_id || '—', e.action || '—', e.entity || '—']);
  if (loading) return <div><PageHead kicker="Administration" title="Audit log." desc="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Administration" title="Audit log." desc="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." /><div className="notice"><strong>Couldn’t load the audit log.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Administration" title="Audit log." desc="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." />
      <Panel title="Recent events" action={<Tag>{rows.length > 0 ? `${rows.length} events` : 'No events yet'}</Tag>}>
        {rows.length > 0 ? (
          <DataTable headers={['Time', 'Actor', 'Action', 'Entity']} rows={rows} />
        ) : (
          <Empty title="No audit events yet." body="Approvals, releases, and decisions will be recorded here." />
        )}
      </Panel>
    </div>
  );
}

export function AdminMessages() {
  const { data: threadRows, loading, error } = useSupabaseList({ table: 'message_threads', order: { col: 'updated_at', ascending: false }, page: 1, pageSize: 20 });
  const { data: replyRows } = useSupabaseList({ table: 'message_replies', page: 1, pageSize: 100 });
  const threads = (threadRows || []).map(toThread);
  const replyCount = new Map();
  (replyRows || []).forEach((r) => {
    const tid = r.thread_id ?? r.threadId;
    replyCount.set(tid, (replyCount.get(tid) || 0) + 1);
  });
  if (loading) return <div><PageHead kicker="Administration" title="Messages." desc="Parent ↔ Diplomatic Impact records. Same record pattern, scoped to linked students." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Administration" title="Messages." desc="Parent ↔ Diplomatic Impact records. Same record pattern, scoped to linked students." /><div className="notice"><strong>Couldn’t load messages.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Administration" title="Messages." desc="Parent ↔ Diplomatic Impact records. Same record pattern, scoped to linked students." />
      <div className="message-list">
        {threads.length === 0 && <Empty title="No messages." body="Parent threads will appear here." />}
        {threads.map((t) => (
          <Link key={t.id} to={`/parent/messages/${t.id}`} className="message-item">
            <div className="row-meta">{t.updatedAt}</div>
            <div><h3>{t.subject}</h3><p>{t.from || '—'} · {replyCount.get(t.id) ?? 0} repl{(replyCount.get(t.id) ?? 0) === 1 ? 'y' : 'ies'}</p></div>
            <Status value={t.state} />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------- Recommendations + announcements (Supabase-backed compose) ---------- */
export function AdminRecommendations() {
  const [title, setTitle] = useState('');
  const [action, setAction] = useState('');
  const [skill, setSkill] = useState('Counter Arguments');
  const [recipient, setRecipient] = useState('All students');
  const [preview, setPreview] = useState(false);
  const [published, setPublished] = useState(false);
  const [composeError, setComposeError] = useState('');
  const { create, saving } = useSupabaseMutation({ table: 'recommendations' });
  const { data: liveRows } = useSupabaseList({ table: 'recommendations', page: 1, pageSize: 5 });
  const { data: studentRows } = useSupabaseList({ table: 'profiles', contains: { col: 'roles', values: ['student'] }, page: 1, pageSize: 50 });
  const live = (liveRows || []).map(toRecommendation);
  const studentOptions = (studentRows || []).map(toProfile);

  return (
    <div>
      <PageHead kicker="Development" title="Recommendations." desc="Send a focused next step to one student or a selected cohort." action={<Button onClick={() => { setPreview(false); document.getElementById('rec-compose')?.scrollIntoView({ behavior: 'smooth' }); }}>New recommendation →</Button>} />
      <section id="rec-compose" className="panel" style={{ marginBottom: 28 }}>
        <div className="panel-head"><h2>Compose</h2><span className="tag">Draft → publish · audience preview required</span></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Recipient<select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <option>All students</option>
            {studentOptions.map((s) => (
              <option key={s.userId || s.email} value={s.email}>{s.name}{s.elevateMeId ? ` · ${s.elevateMeId}` : ''}</option>
            ))}
          </select></label></div>
          <div className="field"><label>Skill<select value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option>Counter Arguments</option><option>Confidence</option><option>Clarity</option><option>Preparation</option>
          </select></label></div>
          <div className="field span-two"><label>Recommendation title<input placeholder="A clear action for the student" value={title} onChange={(e) => setTitle(e.target.value)} /></label></div>
          <div className="field span-two"><label>Action and reason<textarea placeholder="Explain what to do and why it matters" value={action} onChange={(e) => setAction(e.target.value)} /></label></div>
          {composeError && <p role="alert" className="field-error span-two">{composeError}</p>}
          <div className="span-two" style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setPreview(true)}>Preview audience</Button>
            <Button disabled={saving} onClick={async () => {
              setComposeError('');
              if (!title.trim() || !action.trim()) { setComposeError('Title and action are required. Your input is preserved.'); return; }
              try {
                const res = await create({ audience: recipient, title: title.trim(), body: action.trim(), skill, status: 'Published' });
                if (res?.error) throw new Error(res.error.message);
                setPublished(true); setPreview(false);
              } catch (err) {
                setComposeError(`${err?.message || 'Could not publish.'} Your input is preserved.`);
              }
            }}>{saving ? 'Publishing…' : 'Publish recommendation'}</Button>
          </div>
          {preview && <div className="notice span-two"><strong>Audience preview.</strong> “{title || '(untitled)'}” → {recipient}. Skill: {skill}.</div>}
          {published && <div className="notice span-two"><strong>Recommendation published and notified.</strong></div>}
        </div>
      </section>
      {live.length > 0 ? (
        <DataTable headers={['Title', 'Skill', 'Audience', 'Status']} rows={live.map((r) => [r.title, r.skill, r.audience || r.related || '—', <Status key={r.id} value={r.status} />])} />
      ) : (
        <Empty title="Live list" body="Published recommendations appear in the student and parent workspaces." />
      )}
    </div>
  );
}

export function AdminAnnouncements() {
  const [audience, setAudience] = useState('All students');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [composeError, setComposeError] = useState('');
  const { create, saving } = useSupabaseMutation({ table: 'announcements' });
  const { data: liveRows } = useSupabaseList({ table: 'announcements', filters: { status: 'Published' }, page: 1, pageSize: 5 });
  const { count: studentCount } = useSupabaseList({ table: 'profiles', contains: { col: 'roles', values: ['student'] }, page: 1, pageSize: 1 });
  const liveCount = (liveRows || []).map(toAnnouncement).length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHead kicker="Communication" title="Announcements." desc="Publish important updates to students, parents, coordinators or a specific program." action={<Button onClick={() => document.getElementById('ann-compose')?.scrollIntoView({ behavior: 'smooth' })}>New announcement →</Button>} />
      <section id="ann-compose" className="panel" style={{ marginBottom: 28 }}>
        <div className="panel-head"><h2>Compose</h2><span className="tag">Draft → scheduled → published</span></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Audience<select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option>All students</option><option>All parents</option><option>Specific program</option><option>Coordinators</option>
          </select></label></div>
          <div className="field"><label>Publish date<input type="date" defaultValue={today} /></label></div>
          <div className="field span-two"><label>Title<input placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} /></label></div>
          <div className="field span-two"><label>Message<textarea placeholder="Write the update..." value={body} onChange={(e) => setBody(e.target.value)} /></label></div>
          {composeError && <p role="alert" className="field-error span-two">{composeError}</p>}
          <div className="span-two" style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setPreview(true)}>Preview audience</Button>
            <Button disabled={saving} onClick={async () => {
              setComposeError('');
              if (!title.trim() || !body.trim()) { setComposeError('Title and message are required. Your input is preserved.'); return; }
              try {
                const res = await create({ audience, title: title.trim(), body: body.trim(), status: 'Scheduled', sender: 'Diplomatic Impact' });
                if (res?.error) throw new Error(res.error.message);
                setScheduled(true); setPreview(false);
              } catch (err) {
                setComposeError(`${err?.message || 'Could not schedule.'} Your input is preserved.`);
              }
            }}>{saving ? 'Scheduling…' : 'Schedule'}</Button>
          </div>
          {preview && <div className="notice span-two"><strong>Audience preview — {audience}.</strong> “{title || '(untitled)'}” reaches ~{audience === 'All students' ? `${studentCount} students + linked parents` : 'the selected recipients'}. No raw HTML is rendered.</div>}
          {scheduled && <div className="notice span-two"><strong>Announcement scheduled — plain text only, no raw HTML.</strong></div>}
        </div>
      </section>
      <ChartSummary label="Published" value={liveCount > 0 ? `${liveCount} live` : 'None live'} status={<Status value="Active" />} />
    </div>
  );
}
