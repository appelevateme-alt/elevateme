import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert } from "@/components/ui/Feedback";
import { PerformanceChartBlock } from "@/components/domain/Domain";

export default async function ParentStudentPerformance({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  return (
    <div>
      <Eyebrow>Linked student</Eyebrow>
      <PageHeader title="Performance" description={`Amaya Perera · ${studentId} · same released data the student sees.`} />
      <Alert tone="info" title={`Viewing: Amaya Perera · ${studentId}`}>Scoped to your linked student only.</Alert>
      <div className="mt-4">
        <Card title="Overall trend" meta="Accessible chart + data table">
          <PerformanceChartBlock />
        </Card>
      </div>
    </div>
  );
}
