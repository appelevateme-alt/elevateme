import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Eyebrow, SplitLayout } from '../../components/ui/Structure.jsx';
import { DefinitionList, Table } from '../../components/ui/Data.jsx';
import { RegistrationPanel } from '../../components/domain/RegistrationPanel.jsx';
import { mockPrograms, mockSessions } from '../../lib/mock-data.js';
import NotFound from './NotFound.jsx';

export default function ProgramDetail() {
  const { id } = useParams();
  const program = mockPrograms.find((p) => p.id === id);
  if (!program) return <NotFound />;
  const sessions = mockSessions.filter((s) => s.programId === program.id);
  const closed = program.status === 'RegistrationClosed';

  return (
    <div className="container">
      <Eyebrow>Program details</Eyebrow>
      <PageHeader
        title={program.title}
        description={`${program.institute} · ${program.venue} · ${program.startDate} → ${program.endDate}`}
        action={<Badge value={program.status} />}
      />
      <SplitLayout
        main={
          <div className="stack">
            <section>
              <h2 className="em-section-title">About this program</h2>
              <p className="body-text">{program.description}</p>
              <div style={{ marginTop: 12 }}>
                <DefinitionList
                  items={[
                    ['Type', program.singleEventType || program.category],
                    ['Organizer', program.institute],
                    ['Eligibility', 'Open to registered students; coordinator confirms every request.'],
                    ['Availability', `${program.registered}/${program.capacity} registered`],
                  ]}
                />
              </div>
            </section>
            <section>
              <h2 className="em-section-title">Sessions, committees, and tracks</h2>
              {sessions.length === 0 ? (
                <p className="body-text">No sessions published yet.</p>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <Table headers={['Session', 'Topic', 'Date']} rows={sessions.map((s) => [s.title, s.topic, s.date])} />
                </div>
              )}
            </section>
          </div>
        }
        aside={
          <div>
            <h2 className="em-section-title">Registration</h2>
            <div style={{ marginTop: 8 }}>
              <RegistrationPanel programTitle={program.title} sessions={sessions} closed={closed} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Link to="/programs" className="btn btn-ghost">Back to directory</Link>
            </div>
            <div style={{ marginTop: 12 }}>
              <Card title="After you join" meta="What happens next">
                <ol className="list-plain">
                  <li>Request enters <strong>Pending</strong> state.</li>
                  <li>Coordinator confirms, waitlists, or declines.</li>
                  <li>Find the outcome under My Registrations.</li>
                </ol>
              </Card>
            </div>
          </div>
        }
      />
    </div>
  );
}
