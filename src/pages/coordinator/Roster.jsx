import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader, EmptyState } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { FilterBar, Table, DefinitionList } from '../../components/ui/Data.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { mockEvaluations, mockPrograms, mockRegistrations } from '../../lib/mock-data.js';

export function CoordinatorStudents() {
  const [query, setQuery] = useState('');
  const [regFilter, setRegFilter] = useState('all');
  const [evalFilter, setEvalFilter] = useState('all');
  const [sort, setSort] = useState('name-asc');

  const rows = useMemo(() => {
    const f = mockRegistrations.filter((r) => {
      if (query && !`${r.studentName} ${r.elevateMeId}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (regFilter !== 'all' && r.status !== regFilter) return false;
      if (evalFilter !== 'all' && r.evaluationState !== evalFilter) return false;
      return true;
    });
    return [...f].sort((a, b) => {
      if (sort === 'name-asc') return a.studentName.localeCompare(b.studentName);
      if (sort === 'name-desc') return b.studentName.localeCompare(a.studentName);
      return a.status.localeCompare(b.status);
    });
  }, [query, regFilter, evalFilter, sort]);

  return (
    <div>
      <PageHeader title="Students" description="Student Details Sheet across programs you manage." action={<Button variant="secondary">Export CSV (Phase 3)</Button>} />
      <Card title="Roster" meta={`${rows.length} records`}>
        <FilterBar>
          <Field label="Search name or ElevateMe ID">
            <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Amaya or EM-00100" />
          </Field>
          <Field label="Registration">
            <Select value={regFilter} onChange={(e) => setRegFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Waitlisted">Waitlisted</option>
              <option value="Attended">Attended</option>
            </Select>
          </Field>
          <Field label="Evaluation">
            <Select value={evalFilter} onChange={(e) => setEvalFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="NotStarted">Not Started</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Locked">Locked</option>
            </Select>
          </Field>
          <Field label="Sort">
            <Select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="status">Status</option>
            </Select>
          </Field>
        </FilterBar>
        {rows.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState title="No matching students" body="Try widening search or clearing filters." action={<Button variant="secondary" onClick={() => { setQuery(''); setRegFilter('all'); setEvalFilter('all'); }}>Clear filters</Button>} />
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <Table
              headers={['#', 'Student', 'ElevateMe ID', 'Allocation', 'Registration', 'Evaluation', '']}
              rows={rows.map((r, i) => [
                String(i + 1),
                <Link key={`${r.id}-n`} to={`/coordinator/students/${r.elevateMeId}`} className="link-strong">{r.studentName}</Link>,
                r.elevateMeId, r.allocation,
                <Badge key={`${r.id}-1`} value={r.status} />, <Badge key={`${r.id}-2`} value={r.evaluationState} />,
                <Button key={`${r.id}-3`} variant="secondary">Confirm</Button>,
              ])}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

export function CoordinatorStudentDetail() {
  const { studentId } = useParams();
  const evals = mockEvaluations.filter((e) => e.elevateMeId === studentId);
  return (
    <div>
      <PageHeader title={`Student ${studentId}`} description="Individual record: registrations, released evaluations, recommendations." />
      <Card title="Amaya Perera" meta={`${studentId} · Colombo International College`} action={<Badge value="Approved" />}>
        <DefinitionList
          items={[
            ['Programs', 'MUN Colombo 2026 (Confirmed) · Speaking Cohort A (Attended)'],
            ['Released evaluations', String(evals.filter((e) => e.released).length)],
            ['Recommendations', '2 active'],
          ]}
        />
      </Card>
    </div>
  );
}

export function ProgramEdit() {
  const { programId } = useParams();
  const program = mockPrograms.find((p) => p.id === programId) || mockPrograms[0];
  const editable = program.status === 'Draft' || program.status === 'ChangesRequested';
  return (
    <div>
      <Eyebrow>Edit program</Eyebrow>
      <PageHeader title={program.title} description={`Status: ${program.status}`} />
      {editable ? (
        <Card title="Edit fields" meta="Mock form">
          <p className="body-text">Draft editing for {program.title}.</p>
          <div style={{ marginTop: 12 }}><Button>Save changes</Button></div>
        </Card>
      ) : (
        <Alert tone="warning" title="Editing restricted">
          {program.title} is <strong>{program.status}</strong>. After submission, editing is restricted according to
          lifecycle status — request changes through the admin queue or duplicate as a new draft.
          <div style={{ marginTop: 8 }}>
            <Link to={`/coordinator/programs/${program.id}`} className="btn">Back to workspace</Link>
          </div>
        </Alert>
      )}
    </div>
  );
}
