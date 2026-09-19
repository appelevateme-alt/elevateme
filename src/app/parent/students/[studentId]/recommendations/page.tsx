import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert } from "@/components/ui/Feedback";
import { RecommendationItem } from "@/components/domain/Domain";
import { mockRecommendations } from "@/lib/mock-data";

export default async function ParentStudentRecommendations({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  return (
    <div>
      <Eyebrow>Linked student</Eyebrow>
      <PageHeader title="Recommendations" description={`Development actions for Amaya Perera · ${studentId}.`} />
      <Alert tone="info" title={`Viewing: Amaya Perera · ${studentId}`}>Scoped to your linked student only.</Alert>
      <div className="mt-2 border-t border-gray-200">
        {mockRecommendations.map((r) => (
          <RecommendationItem key={r.id} title={r.title} meta={`${r.skill} · priority ${r.priority}`} action={r.action} reason={r.reason} footer={<Badge value={r.status} />} />
        ))}
      </div>
    </div>
  );
}
