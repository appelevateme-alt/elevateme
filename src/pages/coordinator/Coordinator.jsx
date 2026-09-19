import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Table } from '../../components/ui/Data.jsx';
import { ProgramWorkspace } from '../../components/domain/ProgramWorkspace.jsx';
import { mockPrograms, mockRegistrations } from '../../lib/mock-data.js';
import NotFound from '../public/NotFound.jsx';

export function CoordinatorDashboard() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Programs you manage · registrations needing confirmation · evaluation completion"
        action={<Link to="/coordinator/programs/new" className="btn btn-primary">New program</Link>}
      />
      <div className="grid-2">
        <Card title="My programs" meta={`${mockPrograms.length} total`}>
          <Table headers={['Program', 'Status']} rows={mockPrograms.map((p) => [p.title, <Badge key={p.id} value={p.status} />])} />
        </Card>
        <Card title="Registrations needing review" meta="Pending first">
          <Table headers={['Student', 'Status']} rows={mockRegistrations.map((r) => [`${r.studentName} · ${r.elevateMeId}`, <Badge key={r.id} value={r.status} />])} />
        </Card>
      </div>
    </div>
  );
}

export function CoordinatorPrograms() {
  return (
    <div>
      <PageHeader title="Programs and Events" description="Draft → Submitted → Under Review → Approved → Published → … → Archived" action={<Link to="/coordinator/programs/new" className="btn btn-primary">New program</Link>} />
      <Card title="All managed programs" meta="Open a row for the tabbed workspace">
        <Table
          headers={['Title', 'Category', 'Status', 'Registered', '']}
          rows={mockPrograms.map((p) => [p.title, p.category, <Badge key={`${p.id}-s`} value={p.status} />, `${p.registered}/${p.capacity}`, <Link key={`${p.id}-o`} to={`/coordinator/programs/${p.id}`} className="btn">Open</Link>])}
        />
      </Card>
    </div>
  );
}

export function CoordinatorSessions() {
  return (
    <div>
      <PageHeader title="Sessions / Committees" description="MUN committees, debate motions, continuous-program sessions." />
      <Card title="Sessions" meta="Open the program workspace for per-program tabs">
        <div className="row">
          {mockPrograms.map((p) => (
            <Link key={p.id} to={`/coordinator/programs/${p.id}/sessions`} className="btn">{p.title} — sessions</Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function CoordinatorEvaluators() {
  return (
    <div>
      <PageHeader title="Evaluators" description="Invite by email → signed, expiring, single-purpose link → scoped workspace." action={<Button>Invite evaluator</Button>} />
      <Card title="Assignments" meta="Per-program evaluator tabs live in the workspace">
        <Table headers={['Evaluator', 'Session', 'Access']} rows={[['David Mensah', 'UNHRC — Committee A', <Badge key="e1" value="Approved" />]]} />
      </Card>
    </div>
  );
}

export function CoordinatorPerformance() {
  return (
    <div>
      <PageHeader title="Performance" description="Individual and aggregate views for assigned students." />
      <div className="grid-2">
        <Card title="Individual" meta="Per-student trend (mock)"><p className="body-text">Select a student from the roster to preview their trend.</p></Card>
        <Card title="Aggregate" meta="Average by criterion (mock)"><p className="body-text">Pilot report: average by criterion across released evaluations.</p></Card>
      </div>
    </div>
  );
}

export function CoordinatorInsights() {
  return (
    <div>
      <PageHeader title="Class / Cohort Insights" description="Rule-based, evidence-windowed. Min 3 evaluations before trend claims." />
      <Card title="Cohort A — Speaking" meta="32 students · 3 sessions">
        <ul className="list-plain">
          <li>Cohort strongest: Audience Addressing (VG median).</li>
          <li>Needs work: Counter Arguments (G median) — matches pilot recommendations.</li>
        </ul>
      </Card>
    </div>
  );
}

export function CoordinatorProfile() {
  return (
    <div>
      <PageHeader title="Profile" description="Institutional profile. Approval by admin; cannot self-approve." />
      <div className="em-card">
        <div className="em-card-head">
          <div>
            <h2 className="em-section-title">Sarah Fernando</h2>
            <p className="em-meta">Colombo International College</p>
          </div>
          <Badge value="Approved" />
        </div>
        <p className="body-text">Roles: coordinator, evaluator (multi-role enabled). National ID deferred for MVP.</p>
      </div>
    </div>
  );
}

function WorkspaceRoute({ tab }) {
  const { programId } = useParams();
  const exists = mockPrograms.some((p) => p.id === programId);
  if (!exists) return <NotFound />;
  return <ProgramWorkspace programId={programId} active={tab} />;
}

export function ProgramOverview() { return <WorkspaceRoute tab="Overview" />; }
export function ProgramSessions() { return <WorkspaceRoute tab="Sessions" />; }
export function ProgramStudents() { return <WorkspaceRoute tab="Students" />; }
export function ProgramEvaluators() { return <WorkspaceRoute tab="Evaluators" />; }
