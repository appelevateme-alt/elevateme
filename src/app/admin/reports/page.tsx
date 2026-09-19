import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";

export default function AdminReports() {
  return (
    <div>
      <PageHeader title="Reports" description="Pilot trio: registrations · evaluation completion · average by criterion." action={<Button variant="secondary">Export CSV</Button>} />
      <div className="grid gap-4">
        <Card title="Registrations by program" meta="Mock figures">
          <Table headers={["Program", "Registered", "Capacity"]} rows={[["MUN Colombo 2026", "87", "120"], ["Speaking Cohort A", "32", "40"]]} />
        </Card>
        <Card title="Evaluation completion" meta="Target 95% before deadline">
          <Table headers={["Session", "Assigned", "Submitted"]} rows={[["UNHRC — Committee A", "40", "38"], ["Session 3 — Speaking", "32", "30"]]} />
        </Card>
        <Card title="Average by criterion" meta="Released only">
          <Table headers={["Criterion", "Average (L–E)"]} rows={[["Audience Addressing", "VG"], ["Counter Arguments", "G"], ["Sound", "G+"]]} />
        </Card>
      </div>
    </div>
  );
}
