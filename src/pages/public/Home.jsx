import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { publishedPrograms } from '../../lib/mock-data.js';

export default function Home() {
  const programs = publishedPrograms();
  return (
    <div className="container">
      <PageHeader
        title="Grow through speaking, debate, and leadership"
        description="ElevateMe turns participation in MUN, debate, and continuous speaking programs into a structured performance record — with ten-criterion evaluation, insights, and recommendations."
        action={
          <div className="row">
            <Link to="/programs" className="btn">Browse programs</Link>
            <Link to="/sign-up" className="btn btn-primary">Join ElevateMe</Link>
          </div>
        }
      />
      <div className="grid-3">
        <Card title="One ElevateMe profile" meta="Step 1">
          <p className="body-text">Single persistent profile with a unique ElevateMe ID (e.g. EM-00100).</p>
        </Card>
        <Card title="Join approved programs" meta="Step 2">
          <p className="body-text">Single events, continuous programmes, and special programmes — coordinator-confirmed.</p>
        </Card>
        <Card title="Get evaluated on ten criteria" meta="Step 3">
          <p className="body-text">Preparation, Clarity, Confidence, Focus, Critical Analysis, Sound, Audience, Counter Arguments, Wit, Overall.</p>
        </Card>
      </div>

      <h2 className="em-section-title" style={{ margin: '32px 0 12px' }}>Approved programs and events</h2>
      <div className="grid-2">
        {programs.map((p) => (
          <Card key={p.id} title={p.title} meta={`${p.institute} · ${p.venue} · ${p.startDate} → ${p.endDate}`} action={<Badge value={p.status} />}>
            <p className="body-text">{p.description}</p>
            <p className="em-meta">{p.registered}/{p.capacity} registered · {p.category}</p>
            <div style={{ marginTop: 12 }}>
              <Link to={`/programs/${p.id}`} className="btn">View details</Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
