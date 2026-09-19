import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge.jsx';
import { DefinitionList } from '../ui/Data.jsx';
import { PageHeader } from '../ui/Page.jsx';
import { Table } from '../ui/Data.jsx';
import { mockPrograms, mockRegistrations, mockSessions } from '../../lib/mock-data.js';

const TABS = ['Overview', 'Sessions', 'Students', 'Evaluators', 'Performance', 'Settings'];

// Coordinator program workspace: tabs + header status + next valid action.
export function ProgramWorkspace({ programId, active }) {
  const program = mockPrograms.find((p) => p.id === programId) || mockPrograms[0];
  const sessions = mockSessions.filter((s) => s.programId === program.id);
  const roster = mockRegistrations.filter((r) => r.programId === program.id);

  const nextAction = {
    Draft: 'Submit for approval',
    ChangesRequested: 'Revise and resubmit',
    Approved: 'Publish to directory',
    Published: 'Close registration when full',
    InProgress: 'Track evaluations',
    UnderReview: 'Awaiting admin review',
  };

  const tabHref = (t) =>
    t === 'Overview' ? `/coordinator/programs/${program.id}` : `/coordinator/programs/${program.id}/${t.toLowerCase()}`;

  return (
    <div>
      <PageHeader
        title={program.title}
        description={`${program.institute} · ${program.startDate} → ${program.endDate} · Next: ${nextAction[program.status] || program.status}`}
        action={
          <div className="row">
            <Badge value={program.status} />
            <Link to={`/coordinator/programs/${program.id}/edit`} className="btn">Edit</Link>
          </div>
        }
      />
      <nav aria-label="Program workspace" className="tabs">
        <ul>
          {TABS.map((t) => (
            <li key={t}>
              <Link to={tabHref(t)} className={active === t ? 'active' : ''} aria-current={active === t ? 'page' : undefined}>
                {t === 'Sessions' ? 'Sessions/Committees' : t}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {active === 'Overview' && (
        <DefinitionList
          items={[
            ['Type', program.singleEventType || program.category],
            ['Venue', program.venue],
            ['Capacity', `${program.registered}/${program.capacity}`],
            ['Description', program.description],
          ]}
        />
      )}
      {active === 'Sessions' && (
        <Table headers={['Session', 'Topic', 'Date', 'Venue']} rows={sessions.map((s) => [s.title, s.topic, s.date, s.venue])} />
      )}
      {active === 'Students' && (
        <Table
          headers={['Student', 'ElevateMe ID', 'Allocation', 'Registration', 'Evaluation']}
          rows={roster.map((r) => [r.studentName, r.elevateMeId, r.allocation, <Badge key={`${r.id}-s`} value={r.status} />, <Badge key={`${r.id}-e`} value={r.evaluationState} />])}
        />
      )}
      {active === 'Evaluators' && (
        <Table headers={['Evaluator', 'Session', 'Access']} rows={[['David Mensah', sessions[0]?.title || '—', <Badge key="e" value="Approved" />]]} />
      )}
      {active === 'Performance' && (
        <p className="body-text">Individual and aggregate views unlock in Performance once evaluations are released.</p>
      )}
      {active === 'Settings' && (
        <p className="body-text">Registration window, capacity, visibility, and contact details. Editing is restricted after submission according to lifecycle status.</p>
      )}
    </div>
  );
}
