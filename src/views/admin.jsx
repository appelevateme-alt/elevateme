import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, Empty, Metrics, PageHead, Panel, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList } from '../components/domain.jsx';
import { mockInstitutes, mockPrograms, mockRoster, mockThreadDetails } from '../lib/mock-data.js';

/* ---------- Platform overview (prototype adminDashboard) ---------- */
export function AdminOverview() {
  return (
    <div>
      <PageHead kicker="Diplomatic Impact" title="Platform overview." desc="Approvals, evaluations and development actions that need attention."
        action={<Link to="/admin/approvals" className="button">Open approval queue →</Link>} />
      <Metrics items={[
        ['Pending approvals', '07', '3 user · 4 program'],
        ['Active programs', '12', 'Across 8 institutes'],
        ['Students', '486', '42 joined this month'],
        ['Evaluations', '1,842', '96 awaiting release'],
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

/* ---------- Approval queue (prototype + kept review notes) ---------- */
export function AdminApprovals() {
  const [decided, setDecided] = useState({});
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');

  const decide = (key, label) => {
    if ((label === 'Request changes' || label === 'Reject') && !note.trim()) {
      setToast('A note is required for Request changes and Reject.');
      return;
    }
    setDecided((d) => ({ ...d, [key]: label === 'Approve' ? 'Approved' : label === 'Reject' ? 'Rejected' : 'ChangesRequested' }));
    setToast(`${label} recorded — audit entry created.`);
  };

  const row = (key, date, title, sub, by, inst, status) => [
    date, <span key="t"><strong>{title}</strong><br />{sub}</span>, by, inst,
    <Status key="s" value={decided[key] || status} />,
    <span key="a" style={{ display: 'flex', gap: 6 }}>
      <Button small onClick={() => decide(key, 'Approve')}>Approve</Button>
      <Button small variant="secondary" onClick={() => decide(key, 'Request changes')}>Changes</Button>
    </span>,
  ];

  return (
    <div>
      <PageHead kicker="Administration" title="Approval queue." desc="Review access requests, programs and result releases with a clear audit trail." />
      <div className="filter-bar">
        <select aria-label="Request type"><option>All request types</option><option>Program</option><option>User account</option><option>Evaluation release</option></select>
        <select aria-label="Status"><option>Pending review</option><option>Changes requested</option><option>Approved</option></select>
      </div>
      <div className="field" style={{ marginBottom: 18 }}>
        <label>Review note (required for Request changes / Reject)
          <input placeholder="e.g. Add venue and capacity before approval" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} />
        </label>
      </div>
      <DataTable headers={['Submitted', 'Request', 'Submitted by', 'Institute', 'Status', '']}
        rows={[
          row('p1', '18 Sep', 'Right vs Might', 'Friendly Debate', 'Ms. Perera', 'Diplomatic Impact', 'Pending review'),
          row('u1', '18 Sep', 'Coordinator account', 'Mr. D. Karunaratne', 'Self registration', 'Gateway College', 'Pending review'),
          row('e1', '17 Sep', 'Session 06 results', '18 evaluations', 'Dr. Jayasinghe', 'Academic Speaking', 'Ready to release'),
        ]} />
      {toast && <div role="status" className="toast show">{toast}</div>}
    </div>
  );
}

/* ---------- All programs (prototype) ---------- */
export function AdminPrograms() {
  return (
    <div>
      <PageHead kicker="Administration" title="All programs." desc="Monitor every program from draft through publication and completion."
        action={<Button variant="secondary">Export report</Button>} />
      <div className="filter-bar">
        <input type="search" placeholder="Search programs" aria-label="Search programs" />
        <select aria-label="Type"><option>All program types</option></select>
        <select aria-label="Status"><option>All statuses</option></select>
      </div>
      <div className="flat-list">
        {mockPrograms.map((p) => (
          <article key={p.id} className="list-row">
            <div className="row-meta">{p.date}<br />{p.typeLabel}</div>
            <div className="row-main"><h3>{p.title}</h3><p>{p.meta} · {p.registered}/{p.capacity} registered</p></div>
            <div className="row-action"><Status value={p.status} /><Link to={`/coordinator/programs/${p.id}`} className="button secondary small">Manage</Link></div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ---------- Users & institutes (prototype) ---------- */
export function AdminUsers() {
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
        <input type="search" placeholder="Search name, email or ElevateMe ID" aria-label="Search users" />
        <select aria-label="Role"><option>All roles</option><option>Student</option><option>Parent</option><option>Coordinator</option><option>Evaluator</option></select>
      </div>
      <DataTable headers={['User', 'Role', 'Institute', 'Joined', 'Status']}
        rows={mockRoster.map((s, i) => [
          <span key="u"><strong>{s.name}</strong><br /><span className="row-meta">{s.elevateMeId}</span></span>,
          'Student', i % 2 ? 'Ananda College' : 'Royal College', `${12 + i} Sep 2026`, <Status key="s" value="Approved" />,
        ])} />
    </div>
  );
}

export function AdminInstitutes() {
  return (
    <div>
      <PageHead kicker="Administration" title="Institutes." desc="Verification state per institute. Coordinators attach at signup." />
      <Panel title="All institutes" action={<Tag>{mockInstitutes.length} records</Tag>}>
        <DataTable headers={['Institute', 'Verified']}
          rows={mockInstitutes.map((x) => [x.name, x.verified ? 'Yes' : 'No'])} />
      </Panel>
    </div>
  );
}

/* ---------- Evaluations (prototype + kept release) ---------- */
export function AdminEvaluations() {
  const [released, setReleased] = useState(false);
  return (
    <div>
      <PageHead kicker="Administration" title="Evaluations." desc="Review submission progress and control when results become visible." />
      <div className="filter-bar">
        <select aria-label="Program"><option>All programs</option></select>
        <select aria-label="Status"><option>Awaiting release</option><option>Submitted</option><option>Released</option></select>
      </div>
      <DataTable headers={['Program / session', 'Evaluator', 'Sheets', 'Submitted', 'Status', '']}
        rows={[
          [<span key="a"><strong>Academic Speaking</strong><br />Session 06</span>, 'Dr. Jayasinghe', '18', '18 Sep',
            <Status key="s" value={released ? 'Released' : 'Ready to release'} />,
            released
              ? <Button key="b" variant="secondary" small>View</Button>
              : <Button key="b" small onClick={() => setReleased(true)}>Release</Button>],
          [<span key="c"><strong>Friendly Debate</strong><br />Session 02</span>, 'Ms. Wickramasinghe', '32', '12 Sep',
            <Status key="t" value="Released" />, <Button key="d" variant="secondary" small>View</Button>],
        ]} />
      {released && <div className="notice" style={{ marginTop: 18 }}><strong>18 results released.</strong> Students and linked parents can now see them. Audit entry created.</div>}
    </div>
  );
}

/* ---------- Reports / config / audit (kept) ---------- */
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
          <DataTable headers={['Criterion', 'Average level']} rows={[['Preparation', 'VG'], ['Confidence', 'G'], ['Counter Arguments', 'G']]} />
      </Panel>
    </div>
  );
}

export function AdminConfig() {
  const criteria = ['Preparation', 'Clarity', 'Confidence', 'Focus', 'Critical Analysis', 'Vocal Delivery', 'Audience Addressing', 'Counter Arguments', 'Wit', 'Overall Performance'];
  return (
    <div>
      <PageHead kicker="Administration" title="Configuration." desc="Program types, criteria, rubrics — all versioned. History keeps its original rubric." />
      <Panel title="Evaluation template v1" action={<Tag>10 criteria · 50+ model</Tag>}>
        <div className="grid two">
          {criteria.map((c) => (
            <div key={c} style={{ border: '1px solid var(--line)', padding: '10px 14px', fontSize: '.88rem' }}><strong>{c}</strong></div>
          ))}
        </div>
        <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 12 }}>Scale: L Low (+0) · G Good (+1) · VG Very Good (+2) · E Excellent (+3) — provisional mapping, to confirm.</p>
      </Panel>
    </div>
  );
}

export function AdminAudit() {
  return (
    <div>
      <PageHead kicker="Administration" title="Audit log." desc="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." />
      <Panel title="Recent events" action={<Tag>Mock trail</Tag>}>
        <DataTable headers={['Time', 'Actor', 'Action', 'Entity']}
          rows={[
            ['2026-09-18 10:02', 'admin', 'Released evaluation', 'Session 06'],
            ['2026-09-18 09:15', 'admin', 'Approved program', 'Right vs Might'],
            ['2026-09-17 15:40', 'coordinator', 'Confirmed registration', 'EM-00125'],
          ]} />
      </Panel>
    </div>
  );
}

export function AdminMessages() {
  return (
    <div>
      <PageHead kicker="Administration" title="Messages." desc="Parent ↔ Diplomatic Impact records. Same record pattern, scoped to linked students." />
      <div className="message-list">
        {mockThreadDetails.map((t) => (
          <Link key={t.id} to={`/parent/messages/${t.id}`} className="message-item">
            <div className="row-meta">{t.updatedAt}</div>
            <div><h3>{t.subject}</h3><p>{t.studentName} · {t.replies.length} repl{t.replies.length === 1 ? 'y' : 'ies'}</p></div>
            <Status value={t.state} />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------- Recommendations + announcements (prototype + kept compose) ---------- */
export function AdminRecommendations() {
  const [title, setTitle] = useState('');
  const [action, setAction] = useState('');
  const [skill, setSkill] = useState('Counter Arguments');
  const [recipient, setRecipient] = useState('Nimuthu Fernando · EM-00124');
  const [preview, setPreview] = useState(false);
  const [published, setPublished] = useState(false);

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
          <div className="span-two" style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setPreview(true)}>Preview audience</Button>
            <Button onClick={() => { setPublished(true); setPreview(false); }}>Publish recommendation</Button>
          </div>
          {preview && <div className="notice span-two"><strong>Audience preview.</strong> “{title || '(untitled)'}” → {recipient}. Skill: {skill}.</div>}
          {published && <div className="notice span-two"><strong>Recommendation published and notified.</strong></div>}
        </div>
      </section>
      <Empty title="Live list" body="Published recommendations appear in the student and parent workspaces." />
    </div>
  );
}

export function AdminAnnouncements() {
  const [audience, setAudience] = useState('All students');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [scheduled, setScheduled] = useState(false);

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
          <div className="span-two" style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setPreview(true)}>Preview audience</Button>
            <Button onClick={() => { setScheduled(true); setPreview(false); }}>Schedule</Button>
          </div>
          {preview && <div className="notice span-two"><strong>Audience preview — {audience}.</strong> “{title || '(untitled)'}” reaches ~{audience === 'All students' ? '119 students + linked parents' : '32 recipients'}. No raw HTML is rendered.</div>}
          {scheduled && <div className="notice span-two"><strong>Announcement scheduled — plain text only, no raw HTML.</strong></div>}
        </div>
      </section>
      <ChartSummary label="Published" value="3 live" status={<Status value="Active" />} />
    </div>
  );
}
