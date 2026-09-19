import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockInstitutes, mockUsers } from "@/lib/mock-data";

export default function AdminUsers() {
  return (
    <div>
      <PageHeader title="Users and Institutes" description="Role checks on every query — navigation hiding is not authorization." />
      <div className="grid gap-4">
        <Card title="Users" meta={`${mockUsers.length} seeded`}>
          <Table headers={["Name", "Email", "Roles", "Status"]} rows={mockUsers.map((u) => [u.fullName, u.email, u.roles.join(", "), <Badge key={u.id} value={u.status} />])} />
        </Card>
        <Card title="Institutes" meta={`${mockInstitutes.length} records`}>
          <Table headers={["Institute", "Verified"]} rows={mockInstitutes.map((i) => [i.name, i.verified ? "Yes" : "No"])} />
        </Card>
      </div>
    </div>
  );
}
