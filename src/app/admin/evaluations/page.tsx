import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockRegistrations } from "@/lib/mock-data";

export default function AdminEvaluations() {
  return (
    <div>
      <PageHeader title="Evaluations" description="Review all sheets. Control when results become visible (release gate)." action={<Button>Release selected</Button>} />
      <Card title="Submitted sheets" meta="Template v1 · locked on submit">
        <Table headers={["Student", "Allocation", "State", "Release"]} rows={mockRegistrations.map((r) => [r.studentName, r.allocation, <Badge key={r.id} value={r.evaluationState} />, <Button key={`${r.id}-r`} variant="secondary">Release</Button>])} />
      </Card>
    </div>
  );
}
