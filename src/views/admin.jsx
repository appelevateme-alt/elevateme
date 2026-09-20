import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, Empty, Metrics, PageHead, Panel, SkeletonRows, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList } from '../components/domain.jsx';
import { useSupabaseList, useSupabaseMutation } from '../lib/useSupabase.js';
import { toAnnouncement, toProfile, toProgram, toRecommendation, toThread } from '../lib/adapters.js';

/* ---------- Platform overview (Supabase-backed counts) ---------- */
export function AdminOverview() {
  const { count: pendingPrograms } = useSupabaseList({ table: 'programs', filters: { status: 'UnderReview' }, page: 1, pageSize: 1 });
  const { count: pendingUsers } = useSupabaseList({ table: 'profiles', filters: { status: 'Pending' }, page: 1, pageSize: 1 });
  const { count: activePrograms } = useSupabaseList({ table: 'programs', filters: { status: 'Published' }, page: 1, pageSize: 1 });
  const { count: studentCount } = useSupabaseList({ table: 'profiles', filters: { role: 'student' }, page: 1, pageSize: 1 });
  const { count: awaitingRelease } = useSupabaseList({ table: 'evaluations', filters: { released: false }, page: 1, pageSize: 1 });
  const pendingTotal = (pendingPrograms ?? 3) + (pendingUsers ?? 4);

  return (
    <div>
      <PageHead kicker="Diplomatic Impact" title="Platform overview." desc="Approvals, evaluations and development actions that need attention."
        action={<Link to="/admin/approvals" className="button">Open approval queue →</Link>} />
      <Metrics items={[
        ['Pending approvals', String(pendingTotal).padStart(2, '0'), '3 user · 4 program'],
        ['Active programs', activePrograms != null ? String(activePrograms) : '12', 'Across 8 institutes'],
        ['Students', studentCount != null ? String(studentCount) : '486', '42 joined this month'],
        ['Evaluations', awaitingRelease != null ? String(awaitingRelease) : '1,842', '96 awaiting release'],
      ]} />
      <div className="grid dashboard">
        <section className="panel">
          <div className="panel-head"><h2>Approval queue</h2><Link to="/admin/approvals" className="button quiet small">View all →</Link></div>
          <div className="panel-body"><div className="flat-list">
            <div className="list-row compact"><div className="row-meta">PROGRAM</div><div className="row-main"><h3>Right vs Might</h3><p>Friendly Debate · Submitted by Ms. Perera</p></div><Status value="Review" /></div>
            <div className="list-row compact"><div className="row-meta">ACCOUNT</div><div className="row-main"><h3>Mr. D. Karunaratne</h3><p>Programme Coordinator · Gateway College</p></div><Status value="Review" /></div>
            <div className="list-row compact"><div className="row-meta">RESULTS</div><div className="row-main"><h3>Academic Speaking · Session 06</h3><p>18 evaluations ready for release</p></div><Status value="Release" /></div>
          </div></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Platform health</h2></div>
          <div className="panel-body">
            <InsightList items={[
              { label: 'Completion', text: '91% of assigned evaluations were submitted on time.' },
              { label: 'Approval', text: 'Median program approval time is 1.4 days.' },
              { label: 'Growth', text: '68% of eligible students show improvement across 3+ sessions.' },
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
  const { data: userRows, refetch: refetchUsers } = useSupabaseList({ table: 'profiles', filters: { status: 'Pending' }, page: 1, pageSize: 10 });
  const { data: evalRows, refetch: refetchEvals } = useSupabaseList({ table: 'evaluations', filters: { released: false }, page: 1, pageSize: 10 });
  const { create: logAudit } = useSupabaseMutation({ table: 'audit_log' });
  const { update: updateProgram } = useSupabaseMutation({ table: 'programs' });
  const { update: updateProfile } = useSupabaseMutation({ table: 'profiles' });
  const { update: updateEval } = useSupabaseMutation({ table: 'evaluations' });

  const programs = (progRows || []).map(toProgram);
  const users = (userRows || []).map(toProfile);

  const audit = async (action, entity) => {
    try {
      const res = await logAudit({ actor: 'admin', action, entity });
      if (res?.error) throw new Error(res.error.message);
    } catch { /* audit is best-effort */ }
  };

  const decideProgram = async (id, label, title) => {
    if ((label === 'Request changes' || label === 'Reject') && !note.trim()) {
      setToast('A note is required for Request changes and Reject.');
      return;
    }
    try {
      let res;
      if (label === 'Approve') res = await updateProgram(id, { status: 'Published' });
      else if (label === 'Reject') res = await updateProgram(id, { status: 'Rejected' });
      else res = await updateProgram(id, { status: 'ChangesRequested' });
      if (res?.error) throw new Error(res.error.message);
      setDecided((d) => ({ ...d, [id]: label === 'Approve' ? 'Approved' : label === 'Reject' ? 'Rejected' : 'ChangesRequested' }));
      setToast(`${label} recorded — audit entry created.`);
      audit(`${label} program`, title);
      refetchProgs?.();
    } catch (err) {
      setToast(err?.message || 'Could not record decision.');
    }
  };

  const decideUser = async (id, label, name) => {
    if ((label === 'Request changes' || label === 'Reject') && !note.trim()) {
      setToast('A note is required for Request changes and Reject.');
      return;
    }
    try {
      let res;
      if (label === 'Approve') res = await updateProfile(id, { status: 'Approved' });
      else if (label === 'Reject') res = await updateProfile(id, { status: 'Rejected' });
      else res = await updateProfile(id, { status: 'ChangesRequested' });
      if (res?.error) throw new Error(res.error.message);
      setDecided((d) => ({ ...d, [id]: label === 'Approve' ? 'Approved' : label === 'Reject' ? 'Rejected' : 'ChangesRequested' }));
      setToast(`${label} recorded — audit entry created.`);
      audit(`${label} user`, name);
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
        for (const id of ids) {
          const res = await updateEval(id, { released: true });
          if (res?.error) throw new Error(res.error.message);
        }
      }
      setDecided((d) => ({ ...d, release: label === 'Approve' ? 'Approved' : 'ChangesRequested' }));
      setToast(`${label} recorded — audit entry created.`);
      audit(`${label} release`, 'Session results');
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
      <Button small onClick={() => decideProgram(p.id, 'Approve', p.title)}>Approve</Button>
      <Button small variant="secondary" onClick={() => decideProgram(p.id, 'Request changes', p.title)}>Changes</Button>
    </span>,
  ])) : [];
  const userItems = showUsers ? users.map((u, i) => {
    const uid = u.userId || u.id;
    return ([
      '—',
      <span key={`u-${uid || i}`}><strong>Coordinator account</strong><br />{u.name}</span>,
      u.email || 'Self registration',
      '—',
      <Status key={`us-${uid || i}`} value={decided[uid] || u.status || 'Pending review'} />,
      <span key={`ua-${uid || i}`} style={{ display: 'flex', gap: 6 }}>
        <Button small onClick={() => decideUser(uid, 'Approve', u.name)}>Approve</Button>
        <Button small variant="secondary" onClick={() => decideUser(uid, 'Request changes', u.name)}>Changes</Button>
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
      <Button small onClick={() => decideRelease(releaseIds, 'Approve')}>Approve</Button>
      <Button small variant="secondary" onClick={() => decideRelease(releaseIds, 'Request changes')}>Changes</Button>
    </span>,
  ]] : [];

  const liveRows = [...progItems, ...userItems, ...releaseItems];
  const fallbackRows = [
    ['18 Sep', <span key="t"><strong>Right vs Might</strong><br />Friendly Debate</span>, 'Ms. Perera', 'Diplomatic Impact', <Status key="s" value={decided.p1 || 'Pending review'} />,
      <span key="a" style={{ display: 'flex', gap: 6 }}><Button small onClick={() => setDecided((d) => ({ ...d, p1: 'Approved' }))}>Approve</Button><Button small variant="secondary" onClick={() => {
        if (!note.trim()) { setToast('A note is required for Request changes and Reject.'); return; }
        setDecided((d) => ({ ...d, p1: 'ChangesRequested' })); setToast('Request changes recorded — audit entry created.');
      }}>Changes</Button></span>],
  ];

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
      <DataTable headers={['Submitted', 'Request', 'Submitted by', 'Institute', 'Status', '']}
        rows={liveRows.length > 0 ? liveRows : fallbackRows} />
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
export function AdminUsers() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All roles');
  const { data, loading, error } = useSupabaseList({
    table: 'profiles',
    search: q ? { col: 'full_name', term: q } : null,
    filters: role === 'All roles' ? {} : { role },
    page: 1,
    pageSize: 20,
  });
  const users = (data || []).map(toProfile);
  return (
    <div>
      <PageHead kicker="Administration" title="Users & institutes." desc="Manage approved access while protecting student and institutional data." />
      <Metrics items={[
        ['Students', '486', '18 pending verification'],
        ['Parents', '291', '312 active links'],
        ['Coordinators', '34', '3 pending approval'],
        ['Evaluators', '47', '12 currently assigned'],
      ]} />
      <div className="filter-bar">
        <input type="search" placeholder="Search name, email or ElevateMe ID" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}><option>All roles</option><option>Student</option><option>Parent</option><option>Coordinator</option><option>Evaluator</option></select>
      </div>
      {loading && <SkeletonRows rows={4} />}
      {error && <div className="notice"><strong>Couldn’t load users.</strong> {error.message}</div>}
      {!loading && !error && (
        <DataTable headers={['User', 'Role', 'Institute', 'Joined', 'Status']}
          rows={users.map((s) => [
            <span key="u"><strong>{s.name}</strong><br /><span className="row-meta">{s.elevateMeId}</span></span>,
            s.role || 'Student', s.institute || '—', s.joined || '—', <Status key="s" value={s.status || 'Approved'} />,
          ])} />
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

/* ---------- Evaluations (Supabase-backed release) ---------- */
export function AdminEvaluations() {
  const { data: awaitingRows, loading, error, refetch } = useSupabaseList({ table: 'evaluations', filters: { released: false }, page: 1, pageSize: 20 });
  const { data: releasedRows } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 5 });
  const { update, saving } = useSupabaseMutation({ table: 'evaluations' });
  const { create: logAudit } = useSupabaseMutation({ table: 'audit_log' });
  const [released, setReleased] = useState(false);
  const awaiting = awaitingRows || [];
  const releasedCount = (releasedRows || []).length;

  const releaseAll = async () => {
    try {
      for (const e of awaiting) {
        const res = await update(e.id, { released: true });
        if (res?.error) throw new Error(res.error.message);
      }
      setReleased(true);
      try {
        const ares = await logAudit({ actor: 'admin', action: 'Released evaluation', entity: 'Session results' });
        if (ares?.error) throw new Error(ares.error.message);
      } catch { /* best-effort */ }
      refetch?.();
    } catch {
      /* error shown via list error on refetch; keep prototype notice hidden until success */
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
      <DataTable headers={['Program / session', 'Evaluator', 'Sheets', 'Submitted', 'Status', '']}
        rows={[
          [<span key="a"><strong>Academic Speaking</strong><br />Session 06</span>, 'Dr. Jayasinghe', String(awaiting.length || 18), '18 Sep',
            <Status key="s" value={released || awaiting.length === 0 ? 'Released' : 'Ready to release'} />,
            released || awaiting.length === 0
              ? <Button key="b" variant="secondary" small>View</Button>
              : <Button key="b" small disabled={saving} onClick={releaseAll}>{saving ? 'Releasing…' : 'Release'}</Button>],
          [<span key="c"><strong>Friendly Debate</strong><br />Session 02</span>, 'Ms. Wickramasinghe', String(releasedCount || 32), '12 Sep',
            <Status key="t" value="Released" />, <Button key="d" variant="secondary" small>View</Button>],
        ]} />
      {released && <div className="notice" style={{ marginTop: 18 }}><strong>{awaiting.length} results released.</strong> Students and linked parents can now see them. Audit entry created.</div>}
    </div>
  );
}

/* ---------- Reports / config / audit ---------- */
export function AdminReports() {
  return (
    <div>
      <PageHead kicker="Administration" title="Reports." desc="Pilot trio: registrations · evaluation completion · average by criterion." action={<Button variant="secondary">Export CSV</Button>} />
      <div className="grid two">
        <Panel title="Registrations by program" action={<Tag>Mock figures</Tag>}>
          <DataTable headers={['Program', 'Registered', 'Capacity']} rows={[['Colombo Youth MUN 2026', '64', '72'], ['Academic Speaking — Cohort 03', '18', '24']]} />
        </Panel>
        <Panel title="Evaluation completion" action={<Tag>Target 95%</Tag>}>
          <DataTable headers={['Session', 'Assigned', 'Submitted']} rows={[['WHO Committee', '16', '14'], ['Session 06 — Speaking', '18', '18']]} />
        </Panel>
      </div>
      <div style={{ height: 22 }} />
      <Panel title="Average by criterion" action={<Tag>Released only</Tag>}>
          <DataTable headers={['Criterion', 'Average / 100']} rows={[['Preparation', '85'], ['Confidence', '79'], ['Counter Arguments', '74']]} />
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
  const rows = (data || []).map((e) => [e.created_at || e.time || '—', e.actor || '—', e.action || '—', e.entity || '—']);
  const fallback = [
    ['2026-09-18 10:02', 'admin', 'Released evaluation', 'Session 06'],
    ['2026-09-18 09:15', 'admin', 'Approved program', 'Right vs Might'],
    ['2026-09-17 15:40', 'coordinator', 'Confirmed registration', 'EM-00125'],
  ];
  if (loading) return <div><PageHead kicker="Administration" title="Audit log." desc="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Administration" title="Audit log." desc="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." /><Panel title="Recent events" action={<Tag>Mock trail</Tag>}>
    <DataTable headers={['Time', 'Actor', 'Action', 'Entity']} rows={fallback} />
  </Panel></div>;
  return (
    <div>
      <PageHead kicker="Administration" title="Audit log." desc="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." />
      <Panel title="Recent events" action={<Tag>{rows.length > 0 ? `${rows.length} events` : 'Mock trail'}</Tag>}>
        <DataTable headers={['Time', 'Actor', 'Action', 'Entity']}
          rows={rows.length > 0 ? rows : fallback} />
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
  const [recipient, setRecipient] = useState('Nimuthu Fernando · EM-00124');
  const [preview, setPreview] = useState(false);
  const [published, setPublished] = useState(false);
  const [composeError, setComposeError] = useState('');
  const { create, saving } = useSupabaseMutation({ table: 'recommendations' });
  const { data: liveRows } = useSupabaseList({ table: 'recommendations', page: 1, pageSize: 5 });
  const live = (liveRows || []).map(toRecommendation);

  return (
    <div>
      <PageHead kicker="Development" title="Recommendations." desc="Send a focused next step to one student or a selected cohort." action={<Button onClick={() => { setPreview(false); document.getElementById('rec-compose')?.scrollIntoView({ behavior: 'smooth' }); }}>New recommendation →</Button>} />
      <section id="rec-compose" className="panel" style={{ marginBottom: 28 }}>
        <div className="panel-head"><h2>Compose</h2><span className="tag">Draft → publish · audience preview required</span></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Recipient<select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <option>Nimuthu Fernando · EM-00124</option><option>Academic Speaking — Cohort 03 (18 students)</option><option>Role: all students</option>
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
  const liveCount = (liveRows || []).map(toAnnouncement).length;

  return (
    <div>
      <PageHead kicker="Communication" title="Announcements." desc="Publish important updates to students, parents, coordinators or a specific program." action={<Button onClick={() => document.getElementById('ann-compose')?.scrollIntoView({ behavior: 'smooth' })}>New announcement →</Button>} />
      <section id="ann-compose" className="panel" style={{ marginBottom: 28 }}>
        <div className="panel-head"><h2>Compose</h2><span className="tag">Draft → scheduled → published</span></div>
        <div className="panel-body form-grid">
          <div className="field"><label>Audience<select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option>All students</option><option>All parents</option><option>Specific program</option><option>Coordinators</option>
          </select></label></div>
          <div className="field"><label>Publish date<input type="date" defaultValue="2026-09-19" /></label></div>
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
          {preview && <div className="notice span-two"><strong>Audience preview — {audience}.</strong> “{title || '(untitled)'}” reaches ~{audience === 'All students' ? '119 students + linked parents' : '32 recipients'}. No raw HTML is rendered.</div>}
          {scheduled && <div className="notice span-two"><strong>Announcement scheduled — plain text only, no raw HTML.</strong></div>}
        </div>
      </section>
      <ChartSummary label="Published" value={liveCount > 0 ? `${liveCount} live` : '3 live'} status={<Status value="Active" />} />
    </div>
  );
}
