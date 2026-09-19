import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockRegistrations } from "@/lib/mock-data";

export default function StudentRegistrations() {
  return (
    <div>
      <PageHeader title="My Registrations" description="Trace every join: Pending → Confirmed / Waitlisted → Attended / Completed." />
      <Card title="Registration history" meta={`${mockRegistrations.length} records`}>
        <Table
          headers={["Program", "Allocation", "Registration", "Evaluation"]}
          rows={mockRegistrations.map((r) => [
            r.programId, r.allocation, <Badge key={`${r.id}-s`} value={r.status} />, <Badge key={`${r.id}-e`} value={r.evaluationState} />,
          ])}
        />
      </Card>
    </div>
  );
}
