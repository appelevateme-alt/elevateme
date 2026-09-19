import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/Page.jsx';
import { Eyebrow, ContentSection } from '../../components/ui/Structure.jsx';
import { AnnouncementItem } from '../../components/domain/Domain.jsx';
import { mockAnnouncements, mockEvaluations, mockRecommendations, mockRegistrations } from '../../lib/mock-data.js';

export function StudentDashboard() {
  const next = mockRegistrations.find((r) => r.status === 'Confirmed' || r.status === 'Attended');
  const latest = mockEvaluations.find((e) => e.released);

  return (
    <div>
      <Eyebrow>Home</Eyebrow>
      <PageHeader
        title="Good afternoon, Amaya"
        description="EM-00100 · Colombo International College · profile Approved"
        action={<Link to="/student/programs" className="btn btn-primary">Find programs</Link>}
      />
      <ContentSection>
        <h2 className="em-section-title">Next registered event</h2>
        {next ? (
          <p className="body-text">
            <strong>{next.programId === 'p-mun' ? 'MUN Colombo 2026' : 'Speaking Cohort A'}</strong> · {next.allocation} · <Badge value={next.status} />{' '}
            <Link to="/student/registrations" className="link-strong">View registration →</Link>
          </p>
        ) : (
          <EmptyState title="No upcoming events" body="Browse approved programs to register." action={<Link to="/student/programs" className="btn">Browse programs</Link>} />
        )}
      </ContentSection>
      <ContentSection>
        <h2 className="em-section-title">Latest released result</h2>
        {latest ? (
          <p className="body-text">
            <strong>{latest.session}</strong> · {latest.scores.length} criteria ·{' '}
            <Link to={`/student/performance/${latest.id}`} className="link-strong">Open evaluation →</Link>
          </p>
        ) : (
          <EmptyState title="No released results yet" body="Results appear after admin release." />
        )}
      </ContentSection>
      <ContentSection>
        <h2 className="em-section-title">Current recommendations</h2>
        <p className="body-text">
          <strong>{mockRecommendations[0].title}</strong> — {mockRecommendations[0].action}{' '}
          <Link to="/student/recommendations" className="link-strong">View all →</Link>
        </p>
      </ContentSection>
      <ContentSection>
        <h2 className="em-section-title">Recent announcements</h2>
        <div style={{ marginTop: 4 }}>
          {mockAnnouncements.map((a) => (
            <AnnouncementItem key={a.id} title={a.title} meta={`${a.sender} · ${a.date} · ${a.audience}`} body={a.body} />
          ))}
        </div>
      </ContentSection>
    </div>
  );
}

export function StudentProfile() {
  return (
    <div>
      <PageHeader title="My Profile" description="Persistent ElevateMe profile. Scores and history are never edited here." />
      <div className="em-card">
        <div className="em-card-head">
          <div>
            <h2 className="em-section-title">Amaya Perera</h2>
            <p className="em-meta">EM-00100 · Approved</p>
          </div>
          <Badge value="Approved" />
        </div>
        <dl className="def-list">
          <div><dt className="em-meta">Email</dt><dd>amaya@example.edu</dd></div>
          <div><dt className="em-meta">Institute</dt><dd>Colombo International College</dd></div>
          <div><dt className="em-meta">Date of birth</dt><dd>Private — staff verification only</dd></div>
          <div><dt className="em-meta">Phone</dt><dd>Private</dd></div>
        </dl>
      </div>
    </div>
  );
}

export function StudentParentAccess() {
  return (
    <div>
      <PageHeader title="Parent Access" description="Invite a parent via time-limited invitation — never open ID lookup." action={<Button>Issue invitation</Button>} />
      <div className="em-card">
        <div className="em-card-head">
          <div>
            <h2 className="em-section-title">Linked parent</h2>
            <p className="em-meta">Invitation accepted</p>
          </div>
          <Badge value="Approved" />
        </div>
        <p className="body-text">Nimal Perera · nimal@example.com · sees same released data as student.</p>
      </div>
    </div>
  );
}

export function StudentDevelopment() {
  return (
    <div>
      <PageHeader title="Further Development" description="Follow-on programs matched to your insights." />
      <div className="grid-2">
        <div className="em-card">
          <h2 className="em-section-title">Suggested next</h2>
          <p className="em-meta">Based on Counter Arguments insight</p>
          <p className="body-text">Friendly Debate — Motion Night. One evaluation round, rebuttal-heavy format.</p>
        </div>
        <EmptyState title="No enrolments yet" body="Completed development actions will be tracked here." />
      </div>
    </div>
  );
}
