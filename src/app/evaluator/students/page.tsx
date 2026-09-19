import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockRegistrations } from "@/lib/mock-data";

export default function EvaluatorStudents() {
  return (
    <div>
      <PageHeader title="Student List" description="Only students in your assigned sessions." />
      <Card title="Assigned students" meta="One state per student-session">
        <Table headers={["Student", "ElevateMe ID", "Allocation", "State"]} rows={mockRegistrations.map((r) => [r.studentName, r.elevateMeId, r.allocation, <Badge key={r.id} value={r.evaluationState} />])} />
      </Card>
    </div>
  );
}
