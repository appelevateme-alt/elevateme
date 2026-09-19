import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockPrograms } from "@/lib/mock-data";

export default function AdminPrograms() {
  return (
    <div>
      <PageHeader title="Programs and Events" description="Platform-wide list with lifecycle control and publication gate." />
      <Card title="All programs" meta={`${mockPrograms.length} records`}>
        <Table headers={["Title", "Type", "Status", "Capacity"]} rows={mockPrograms.map((p) => [p.title, p.singleEventType ?? p.category, <Badge key={p.id} value={p.status} />, `${p.registered}/${p.capacity}`])} />
      </Card>
    </div>
  );
}
