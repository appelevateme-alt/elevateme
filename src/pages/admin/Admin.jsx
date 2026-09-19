import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { PageHeader, EmptyState } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { FilterBar, MetricLine, Table } from '../../components/ui/Data.jsx';
import { Alert, ConfirmDialog, Toast } from '../../components/ui/Feedback.jsx';
import { ApprovalRecord } from '../../components/domain/Domain.jsx';
import { mockInstitutes, mockPrograms, mockRegistrations, mockThreadDetails, mockUsers } from '../../lib/mock-data.js';

export function AdminOverview() {
  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader
        title="Operational overview"
        description="1 program + 2 accounts awaiting review · 2 submitted evaluations pending release · 1 open parent thread."
        action={<Link to="/admin/approvals" className="btn btn-primary">Open approval queue</Link>}
      />
      <Card title="Jump to" meta="Full destinations live in the sidebar">
        <div className="row">
          <Link to="/admin/programs" className="btn">Programs</Link>
          <Link to="/admin/evaluations" className="btn">Evaluations</Link>
          <Link to="/admin/announcements" className="btn">Announcements</Link>
          <Link to="/admin/messages" className="btn">Messages</Link>
          <Link to="/admin/reports" className="btn">Reports</Link>
        </div>
        <div style={{ marginTop: 12 }}>
          <MetricLine label="Approval queue" value="3 pending" hint="1 program · 2 accounts" />
          <MetricLine label="Evaluations" value="2 submitted" hint="release gate" />
          <MetricLine label="Pilot reports" value="registrations · completion · averages" hint="CSV export with audit" />
        </div>
      </Card>
    </div>
  );
}

export function AdminApprovals() {
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState('');
  const [decided, setDecided] = useState({});

  const items = mockPrograms.filter((p) => {
    if (type !== 'all' && (p.singleEventType || p.category) !== type) return false;
    if (query && !p.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const act = (action, title) => {
    if ((action === 'Request changes' || action === 'Reject') && !note.trim()) {
      setToast('A note is required for Request changes and Reject.');
      return;
    }
    setConfirm({ action, title });
  };

  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Approval queue" description="1 program + 2 accounts awaiting review. Approving changes visibility or access." />
      <FilterBar>
        <Field label="Request type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Programs + accounts</option>
            <option value="ModelUN">Model UN</option>
            <option value="FriendlyDebate">Friendly Debate</option>
            <option value="ContinuousProgramme">Continuous Programme</option>
          </Select>
        </Field>
        <Field label="Search">
          <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Program or institute" />
        </Field>
      </FilterBar>
      <div style={{ marginTop: 12 }}>
        <Field label="Review note (required for Request changes / Reject)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Add venue and capacity before approval" />
        </Field>
      </div>
      <div className="stack" style={{ marginTop: 16 }}>
        {items.length === 0 ? (
          <EmptyState title="Queue is clear" body="No requests match these filters." action={<Button variant="secondary" onClick={() => { setType('all'); setQuery(''); }}>Clear filters</Button>} />
        ) : (
          items.map((p) => (
            <ApprovalRecord
              key={p.id} title={p.title} meta={`${p.institute} · submitted Sep 10 · ${p.status}`}
              submitted={<p>{p.description}<br /><span className="em-meta">{p.registered}/{p.capacity} · {p.startDate} → {p.endDate}</span></p>}
              review={<div className="stack"><span><Badge value={decided[p.id] || p.status} /></span><span className="em-meta">Check eligibility, capacity, venue, and safeguarding notes before deciding.</span></div>}
              actions={<><Button onClick={() => act('Approve', p.title)}>Approve</Button><Button variant="secondary" onClick={() => act('Request changes', p.title)}>Request changes</Button><Button variant="ghost" onClick={() => act('Reject', p.title)}>Reject</Button></>}
            />
          ))
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={`${confirm?.action}: ${confirm?.title}?`}
        body={confirm?.action === 'Approve' ? 'The program becomes Published and visible in the public directory and student app.' : `The coordinator sees your note. A note is required for this action.`}
        confirmLabel={confirm?.action || 'Confirm'}
        onConfirm={() => {
          if (confirm) {
            const id = (mockPrograms.find((p) => p.title === confirm.title) || {}).id || confirm.title;
            setDecided((d) => ({ ...d, [id]: confirm.action === 'Approve' ? 'Approved' : confirm.action === 'Reject' ? 'Rejected' : 'ChangesRequested' }));
          }
          setToast(`${confirm?.action} recorded with audit entry.`);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      <Alert tone="info" title="Audit">Every approval, change request, and rejection is recorded with actor, timestamp, and note.</Alert>
    </div>
  );
}

export function AdminPrograms() {
  return (
    <div>
      <PageHeader title="Programs and Events" description="Platform-wide list with lifecycle control and publication gate." />
      <Card title="All programs" meta={`${mockPrograms.length} records`}>
        <Table headers={['Title', 'Type', 'Status', 'Capacity']} rows={mockPrograms.map((p) => [p.title, p.singleEventType || p.category, <Badge key={p.id} value={p.status} />, `${p.registered}/${p.capacity}`])} />
      </Card>
    </div>
  );
}

export function AdminUsers() {
  return (
    <div>
      <PageHeader title="Users and Institutes" description="Role checks on every query — navigation hiding is not authorization." />
      <div className="stack">
        <Card title="Users" meta={`${mockUsers.length} seeded`}>
          <Table headers={['Name', 'Email', 'Roles', 'Status']} rows={mockUsers.map((u) => [u.fullName, u.email, u.roles.join(', '), <Badge key={u.id} value={u.status} />])} />
        </Card>
        <Card title="Institutes" meta={`${mockInstitutes.length} records`}>
          <Table headers={['Institute', 'Verified']} rows={mockInstitutes.map((i) => [i.name, i.verified ? 'Yes' : 'No'])} />
        </Card>
      </div>
    </div>
  );
}

export function AdminInstitutes() {
  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Institutes" description="Verification state per institute. Coordinators attach at signup." />
      <Card title="All institutes" meta={`${mockInstitutes.length} records`}>
        <Table headers={['Institute', 'Verified']} rows={mockInstitutes.map((i) => [i.name, i.verified ? 'Yes' : 'No'])} />
      </Card>
    </div>
  );
}

export function AdminEvaluations() {
  return (
    <div>
      <PageHeader title="Evaluations" description="Review all sheets. Control when results become visible (release gate)." action={<Button>Release selected</Button>} />
      <Card title="Submitted sheets" meta="Template v1 · locked on submit">
        <Table headers={['Student', 'Allocation', 'State', 'Release']} rows={mockRegistrations.map((r) => [r.studentName, r.allocation, <Badge key={r.id} value={r.evaluationState} />, <Button key={`${r.id}-r`} variant="secondary">Release</Button>])} />
      </Card>
    </div>
  );
}

export function AdminReports() {
  return (
    <div>
      <PageHeader title="Reports" description="Pilot trio: registrations · evaluation completion · average by criterion." action={<Button variant="secondary">Export CSV</Button>} />
      <div className="stack">
        <Card title="Registrations by program" meta="Mock figures">
          <Table headers={['Program', 'Registered', 'Capacity']} rows={[['MUN Colombo 2026', '87', '120'], ['Speaking Cohort A', '32', '40']]} />
        </Card>
        <Card title="Evaluation completion" meta="Target 95% before deadline">
          <Table headers={['Session', 'Assigned', 'Submitted']} rows={[['UNHRC — Committee A', '40', '38'], ['Session 3 — Speaking', '32', '30']]} />
        </Card>
        <Card title="Average by criterion" meta="Released only">
          <Table headers={['Criterion', 'Average (L–E)']} rows={[['Audience Addressing', 'VG'], ['Counter Arguments', 'G'], ['Sound', 'G+']]} />
        </Card>
      </div>
    </div>
  );
}

export function AdminConfig() {
  return (
    <div>
      <PageHeader title="Configuration" description="Program types, criteria, rubrics — all versioned. History keeps its original rubric." />
      <Card title="Evaluation template v1" meta="10 criteria · scale TBC (50 + L/G/VG/E)">
        <ul className="grid-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {['Preparation', 'Clarity', 'Confidence', 'Focus', 'Critical Analysis', 'Sound', 'Audience Addressing', 'Counter Arguments', 'Wit', 'Overall Performance'].map((c) => (
            <li key={c} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '8px 12px', fontSize: 14 }}><strong>{c}</strong></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function AdminAudit() {
  return (
    <div>
      <PageHeader title="Audit Log" description="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." />
      <Card title="Recent events" meta="Mock trail">
        <Table
          headers={['Time', 'Actor', 'Action', 'Entity']}
          rows={[
            ['2026-09-14 10:02', 'admin', 'Released evaluation', 'r-3'],
            ['2026-09-13 15:40', 'coordinator', 'Confirmed registration', 'r-2'],
            ['2026-09-12 09:15', 'admin', 'Approved program', 'p-mun'],
          ]}
        />
      </Card>
    </div>
  );
}

export function AdminMessages() {
  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Messages" description="Parent ↔ Diplomatic Impact records. Same bordered-record pattern, scoped to linked students." />
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {mockThreadDetails.map((t) => (
          <article key={t.id} className="record">
            <div className="record-main">
              <p className="em-item-title">{t.subject}</p>
              <p className="em-meta">{t.studentName} · {t.updatedAt} · {t.replies.length} repl{t.replies.length === 1 ? 'y' : 'ies'}</p>
            </div>
            <div className="record-side">
              <Badge value={t.state} />
              <Link to={`/parent/messages/${t.id}`} className="btn">Open record</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
