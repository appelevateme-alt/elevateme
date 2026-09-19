import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { DefinitionList } from "@/components/ui/Data";
import { mockEvaluations } from "@/lib/mock-data";

export default async function CoordinatorStudentDetail({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const evals = mockEvaluations.filter((e) => e.elevateMeId === studentId);

  return (
    <div>
      <PageHeader title={`Student ${studentId}`} description="Individual record: registrations, released evaluations, recommendations." />
      <Card title="Amaya Perera" meta={`${studentId} · Colombo International College`} action={<Badge value="Approved" />}>
        <DefinitionList
          items={[
            ["Programs", "MUN Colombo 2026 (Confirmed) · Speaking Cohort A (Attended)"],
            ["Released evaluations", String(evals.filter((e) => e.released).length)],
            ["Recommendations", "2 active"],
          ]}
        />
      </Card>
    </div>
  );
}
