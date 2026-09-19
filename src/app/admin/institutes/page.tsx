import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Table } from "@/components/ui/Table";
import { mockInstitutes } from "@/lib/mock-data";

export default function InstitutesPage() {
  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Institutes" description="Verification state per institute. Coordinators attach at signup." />
      <Card title="All institutes" meta={`${mockInstitutes.length} records`}>
        <Table headers={["Institute", "Verified"]} rows={mockInstitutes.map((i) => [i.name, i.verified ? "Yes" : "No"])} />
      </Card>
    </div>
  );
}
