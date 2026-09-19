import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockPrograms, mockRegistrations } from "@/lib/mock-data";

export default function CoordinatorDashboard() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Programs you manage · registrations needing confirmation · evaluation completion"
        action={<Link href="/coordinator/programs/new"><Button>New program</Button></Link>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="My programs" meta={`${mockPrograms.length} total`}>
          <Table
            headers={["Program", "Status"]}
            rows={mockPrograms.map((p) => [p.title, <Badge key={p.id} value={p.status} />])}
          />
        </Card>
        <Card title="Registrations needing review" meta="Pending first">
          <Table
            headers={["Student", "Status"]}
            rows={mockRegistrations.map((r) => [`${r.studentName} · ${r.elevateMeId}`, <Badge key={r.id} value={r.status} />])}
          />
        </Card>
      </div>
    </div>
  );
}
