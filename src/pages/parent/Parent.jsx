import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { PerformanceChartBlock, RecommendationItem } from '../../components/domain/Domain.jsx';
import { mockRecommendations } from '../../lib/mock-data.js';

export function ParentOverview() {
  return (
    <div className="stack">
      <div>
        <PageHeader title="Student Overview" description="Amaya Perera · EM-00100 · linked via verified invitation" action={<Link to="/parent/students/EM-00100" className="btn">Open student record</Link>} />
      </div>
      <Alert tone="info" title="Viewing: Amaya Perera · EM-00100">One student linked — the selector appears only with more than one linked student.</Alert>
      <div className="grid-2">
        <Card title="Progress snapshot" meta="Released results only">
          <p className="body-text">2 programs · 3 released evaluations · strongest: Audience Addressing.</p>
        </Card>
        <Card title="Latest recommendation" meta={mockRecommendations[0].skill} action={<Badge value={mockRecommendations[0].priority} />}>
          <p className="body-text">{mockRecommendations[0].action}</p>
        </Card>
      </div>
    </div>
  );
}

export function ParentPerformance() {
  return (
    <div>
      <PageHeader title="Performance" description="Same released scores and remarks as the student sees." />
      <Card title="Trend (mock)" meta="Released only">
        <PerformanceChartBlock />
      </Card>
    </div>
  );
}

export function ParentRecommendations() {
  return (
    <div>
      <PageHeader title="Recommendations" description="Development actions for your linked student." />
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {mockRecommendations.map((r) => (
          <RecommendationItem key={r.id} title={r.title} meta={`${r.studentName} · ${r.skill}`} action={r.action} reason={r.reason} footer={<Badge value={r.status} />} />
        ))}
      </div>
    </div>
  );
}

export function ParentStudent() {
  const { studentId } = useParams();
  return (
    <div className="stack">
      <div>
        <Eyebrow>Linked student</Eyebrow>
        <PageHeader title="Amaya Perera" description={`${studentId} · Colombo International College`} />
      </div>
      <Alert tone="info" title={`Viewing: Amaya Perera · ${studentId}`}>Linked via verified invitation. One student linked — selector appears only with more than one.</Alert>
      <div className="grid-3">
        <Card title="Performance" meta="Released only">
          <p className="body-text">Overall trend and criterion comparison.</p>
          <div style={{ marginTop: 8 }}><Link to={`/parent/students/${studentId}/performance`} className="btn">Open performance</Link></div>
        </Card>
        <Card title="Recommendations" meta={`${mockRecommendations.length} active`} action={<Badge value="New" />}>
          <p className="body-text">{mockRecommendations[0].title}</p>
          <div style={{ marginTop: 8 }}><Link to={`/parent/students/${studentId}/recommendations`} className="btn">Open recommendations</Link></div>
        </Card>
        <Card title="Messages" meta="Request/reply">
          <p className="body-text">Exchange scoped records with Diplomatic Impact.</p>
          <div style={{ marginTop: 8 }}><Link to="/parent/messages" className="btn">Open messages</Link></div>
        </Card>
      </div>
    </div>
  );
}

export function ParentStudentPerformance() {
  const { studentId } = useParams();
  return (
    <div>
      <Eyebrow>Linked student</Eyebrow>
      <PageHeader title="Performance" description={`Amaya Perera · ${studentId} · same released data the student sees.`} />
      <Alert tone="info" title={`Viewing: Amaya Perera · ${studentId}`}>Scoped to your linked student only.</Alert>
      <div style={{ marginTop: 16 }}>
        <Card title="Overall trend" meta="Accessible chart + data table">
          <PerformanceChartBlock />
        </Card>
      </div>
    </div>
  );
}

export function ParentStudentRecommendations() {
  const { studentId } = useParams();
  return (
    <div>
      <Eyebrow>Linked student</Eyebrow>
      <PageHeader title="Recommendations" description={`Development actions for Amaya Perera · ${studentId}.`} />
      <Alert tone="info" title={`Viewing: Amaya Perera · ${studentId}`}>Scoped to your linked student only.</Alert>
      <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
        {mockRecommendations.map((r) => (
          <RecommendationItem key={r.id} title={r.title} meta={`${r.skill} · priority ${r.priority}`} action={r.action} reason={r.reason} footer={<Badge value={r.status} />} />
        ))}
      </div>
    </div>
  );
}
