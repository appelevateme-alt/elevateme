import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";

export default function AdminAudit() {
  return (
    <div>
      <PageHeader title="Audit Log" description="Immutable history: approvals, score changes, releases, exports, role changes, suspensions." />
      <Card title="Recent events" meta="Mock trail">
        <Table
          headers={["Time", "Actor", "Action", "Entity"]}
          rows={[
            ["2026-09-14 10:02", "admin", "Released evaluation", "r-3"],
            ["2026-09-13 15:40", "coordinator", "Confirmed registration", "r-2"],
            ["2026-09-12 09:15", "admin", "Approved program", "p-mun"],
          ]}
        />
      </Card>
    </div>
  );
}
