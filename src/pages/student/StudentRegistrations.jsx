import { Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Table } from '../../components/ui/Data.jsx';
import { mockRegistrations } from '../../lib/mock-data.js';

export function StudentRegistrations() {
  return (
    <div>
      <PageHeader title="My Registrations" description="Trace every join: Pending → Confirmed / Waitlisted → Attended / Completed." />
      <Card title="Registration history" meta={`${mockRegistrations.length} records`}>
        <Table
          headers={['Program', 'Allocation', 'Registration', 'Evaluation']}
          rows={mockRegistrations.map((r) => [
            r.programId, r.allocation, <Badge key={`${r.id}-s`} value={r.status} />, <Badge key={`${r.id}-e`} value={r.evaluationState} />,
          ])}
        />
      </Card>
    </div>
  );
}
