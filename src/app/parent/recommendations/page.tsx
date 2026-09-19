import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { mockRecommendations } from "@/lib/mock-data";

export default function ParentRecommendations() {
  return (
    <div>
      <PageHeader title="Recommendations" description="Development actions for your linked student." />
      <div className="grid gap-4">
        {mockRecommendations.map((r) => (
          <Card key={r.id} title={r.title} meta={`${r.studentName} · ${r.skill}`} action={<Badge value={r.status} />}>
            <p className="text-sm text-gray-700">{r.action}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
