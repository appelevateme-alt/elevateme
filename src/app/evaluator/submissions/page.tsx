import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Table } from "@/components/ui/Table";
import { mockRegistrations } from "@/lib/mock-data";

export default function EvaluatorSubmissions() {
  return (
    <div>
      <Eyebrow>Evaluator workspace</Eyebrow>
      <PageHeader title="Submissions" description="Not Started → Draft → Submitted → Locked (→ Reopened, audited)." />
      <Card title="All my submissions" meta={`${mockRegistrations.length} student-sessions`}>
        <Table
          headers={["Student", "Allocation", "State"]}
          rows={mockRegistrations.map((r) => [r.studentName, r.allocation, <Badge key={r.id} value={r.evaluationState} />])}
        />
      </Card>
    </div>
  );
}
