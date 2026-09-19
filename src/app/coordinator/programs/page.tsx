import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockPrograms } from "@/lib/mock-data";

export default function CoordinatorPrograms() {
  return (
    <div>
      <PageHeader title="Programs and Events" description="Draft → Submitted → Under Review → Approved → Published → … → Archived" action={<Link href="/coordinator/programs/new"><Button>New program</Button></Link>} />
      <Card title="All managed programs" meta="Open a row for the tabbed workspace">
        <Table
          headers={["Title", "Category", "Status", "Registered", ""]}
          rows={mockPrograms.map((p) => [p.title, p.category, <Badge key={`${p.id}-s`} value={p.status} />, `${p.registered}/${p.capacity}`, <Link key={`${p.id}-o`} href={`/coordinator/programs/${p.id}`}><Button variant="secondary">Open</Button></Link>])}
        />
      </Card>
    </div>
  );
}
