import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { DefinitionList } from "@/components/ui/Data";
import { Table } from "@/components/ui/Table";
import { mockEvaluations } from "@/lib/mock-data";

export default async function EvaluationDetailPage({ params }: { params: Promise<{ evaluationId: string }> }) {
  const { evaluationId } = await params;
  const evaluation = mockEvaluations.find((e) => e.id === evaluationId);
  if (!evaluation || !evaluation.released) notFound();

  return (
    <div>
      <Eyebrow>Released evaluation</Eyebrow>
      <PageHeader
        title={evaluation.session}
        description={`${evaluation.studentName} · ${evaluation.elevateMeId} · ${evaluation.state}`}
        action={<Badge value="Locked" />}
      />
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card title="Criterion scores" meta="Template v1 · levels L/G/VG/E">
          <Table
            headers={["Criterion", "Level"]}
            rows={evaluation.scores.map((s) => [s.criterion, <Badge key={s.criterion} value={s.level} />])}
          />
        </Card>
        <Card title="Remarks" meta="Shared on release">
          <p className="text-sm text-gray-700">{evaluation.remarks}</p>
          <div className="mt-3">
            <Link href="/student/performance"><Button variant="secondary">Back to performance</Button></Link>
          </div>
        </Card>
      </div>
      <div className="mt-4">
        <DefinitionList items={[["Visibility", "Released by admin — visible to student and linked parent."], ["Scale", "Baseline 50 + level add-ons (numeric mapping TBC)."]]} />
      </div>
    </div>
  );
}
