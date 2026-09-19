import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader, EmptyState } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { FilterBar, MetricLine, Table } from '../../components/ui/Data.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { mockRegistrations, mockSessions } from '../../lib/mock-data.js';

export function EvaluatorHome() {
  const total = mockRegistrations.length;
  const submitted = mockRegistrations.filter((r) => r.evaluationState === 'Submitted' || r.evaluationState === 'Locked').length;

  return (
    <div>
      <Eyebrow>Evaluator workspace</Eyebrow>
      <PageHeader title="Assigned sessions" description="Distraction-free and task-oriented. Scoped access only." />
      <Card title="Completion" meta="Submitted / total across assignments">
        <MetricLine label="Progress" value={`${submitted} / ${total} submitted`} hint="pilot target 95% before deadline" />
      </Card>
      <h2 className="em-section-title" style={{ margin: '24px 0 8px' }}>Assignments</h2>
      {mockSessions.length === 0 ? (
        <EmptyState title="No assignments" body="Assigned sessions from coordinators will appear here." />
      ) : (
        <Card title="My assignments" meta={`${mockSessions.length} sessions`}>
          <Table
            headers={['Session', 'Date', 'Progress', '']}
            rows={mockSessions.map((s) => [s.title, s.date, <Badge key={`${s.id}-p`} value="Draft" />, <Link key={s.id} to={`/evaluator/assignments/${s.id}`} className="btn">Open assignment</Link>])}
          />
        </Card>
      )}
      <p className="em-meta" style={{ marginTop: 12 }}>Legacy single-form entry remains at <Link to="/evaluator/evaluate">Evaluation Form</Link>; per-student sheets are under each assignment.</p>
    </div>
  );
}

export function AssignmentPage() {
  const { assignmentId } = useParams();
  const session = mockSessions.find((s) => s.id === assignmentId) || mockSessions[0];
  const [query, setQuery] = useState('');
  const students = useMemo(
    () => mockRegistrations.filter((r) => !query || `${r.studentName} ${r.elevateMeId}`.toLowerCase().includes(query.toLowerCase())),
    [query]
  );
  const done = mockRegistrations.filter((r) => r.evaluationState === 'Submitted' || r.evaluationState === 'Locked').length;

  return (
    <div>
      <Eyebrow>Assignment</Eyebrow>
      <PageHeader title={session.title} description={`${session.topic} · ${session.date} · ${session.venue}`} />
      <Card title="Instructions" meta="Session context always visible">
        <p className="body-text">Score all ten criteria per student. Save drafts freely; submitting locks the sheet. Reopen is audited.</p>
        <div style={{ marginTop: 8 }}><MetricLine label="Completion" value={`${done} / ${mockRegistrations.length} submitted`} /></div>
      </Card>
      <h2 className="em-section-title" style={{ margin: '24px 0 8px' }}>Students</h2>
      <Card title="Student list" meta="Searchable · status markers">
        <FilterBar>
          <Field label="Search students">
            <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or ElevateMe ID" />
          </Field>
        </FilterBar>
        {students.length === 0 ? (
          <div style={{ marginTop: 12 }}><EmptyState title="No matching students" body="Clear the search to see the full list." action={<Button variant="secondary" onClick={() => setQuery('')}>Clear search</Button>} /></div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <Table
              headers={['Student', 'ElevateMe ID', 'Status', '']}
              rows={students.map((r, i) => [
                r.studentName, r.elevateMeId, <Badge key={r.id} value={r.evaluationState} />,
                <span key={`${r.id}-nav`} className="row">
                  <Link to={`/evaluator/assignments/${session.id}/students/${r.elevateMeId}`} className="btn">Evaluate</Link>
                  {students[i + 1] && <Link to={`/evaluator/assignments/${session.id}/students/${students[i + 1].elevateMeId}`} className="btn btn-ghost">Next →</Link>}
                </span>,
              ])}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

export function EvaluatorStudents() {
  return (
    <div>
      <PageHeader title="Student List" description="Only students in your assigned sessions." />
      <Card title="Assigned students" meta="One state per student-session">
        <Table headers={['Student', 'ElevateMe ID', 'Allocation', 'State']} rows={mockRegistrations.map((r) => [r.studentName, r.elevateMeId, r.allocation, <Badge key={r.id} value={r.evaluationState} />])} />
      </Card>
    </div>
  );
}

export function EvaluatorSubmissions() {
  return (
    <div>
      <Eyebrow>Evaluator workspace</Eyebrow>
      <PageHeader title="Submissions" description="Not Started → Draft → Submitted → Locked (→ Reopened, audited)." />
      <Card title="All my submissions" meta={`${mockRegistrations.length} student-sessions`}>
        <Table headers={['Student', 'Allocation', 'State']} rows={mockRegistrations.map((r) => [r.studentName, r.allocation, <Badge key={r.id} value={r.evaluationState} />])} />
      </Card>
    </div>
  );
}
