import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { DefinitionList, Table } from '../../components/ui/Data.jsx';
import { mockEvaluations } from '../../lib/mock-data.js';
import NotFound from '../public/NotFound.jsx';

export function EvaluationDetail() {
  const { evaluationId } = useParams();
  const evaluation = mockEvaluations.find((e) => e.id === evaluationId);
  if (!evaluation || !evaluation.released) return <NotFound />;

  return (
    <div>
      <Eyebrow>Released evaluation</Eyebrow>
      <PageHeader
        title={evaluation.session}
        description={`${evaluation.studentName} · ${evaluation.elevateMeId} · ${evaluation.state}`}
        action={<Badge value="Locked" />}
      />
      <div className="grid-2">
        <Card title="Criterion scores" meta="Template v1 · levels L/G/VG/E">
          <Table headers={['Criterion', 'Level']} rows={evaluation.scores.map((s) => [s.criterion, <Badge key={s.criterion} value={s.level} />])} />
        </Card>
        <Card title="Remarks" meta="Shared on release">
          <p className="body-text">{evaluation.remarks}</p>
          <div style={{ marginTop: 12 }}>
            <Link to="/student/performance" className="btn">Back to performance</Link>
          </div>
        </Card>
      </div>
      <div style={{ marginTop: 16 }}>
        <DefinitionList items={[['Visibility', 'Released by admin — visible to student and linked parent.'], ['Scale', 'Baseline 50 + level add-ons (numeric mapping TBC).']]} />
      </div>
    </div>
  );
}
