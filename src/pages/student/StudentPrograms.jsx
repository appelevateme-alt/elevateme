import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { publishedPrograms } from '../../lib/mock-data.js';

export function StudentPrograms() {
  return (
    <div>
      <PageHeader title="Programs and Events" description="Approved programs only. Joining creates a Pending registration for coordinator confirmation." />
      <div className="grid-2">
        {publishedPrograms().map((p) => (
          <Card key={p.id} title={p.title} meta={`${p.institute} · ${p.startDate}`} action={<Badge value={p.status} />}>
            <p className="body-text">{p.description}</p>
            <div className="row" style={{ marginTop: 12 }}>
              <Link to={`/programs/${p.id}`} className="btn">Details</Link>
              <Link to={`/student/programs/${p.id}`} className="btn btn-primary">Join program</Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
