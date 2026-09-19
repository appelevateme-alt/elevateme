import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockRegistrations } from "@/lib/mock-data";

export default function EvaluatorStatus() {
  return (
    <div>
      <PageHeader title="Submission Status" description="Not Started → Draft → Submitted → Locked (→ Reopened, audited)." />
      <Card title="My submissions" meta="Pilot target: 95% submitted before deadline">
        <Table headers={["Student", "Session", "State"]} rows={mockRegistrations.map((r) => [r.studentName, r.allocation, <Badge key={r.id} value={r.evaluationState} />])} />
      </Card>
    </div>
  );
}
