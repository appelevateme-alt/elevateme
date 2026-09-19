import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";

export default function CoordinatorInsights() {
  return (
    <div>
      <PageHeader title="Class / Cohort Insights" description="Rule-based, evidence-windowed. Min 3 evaluations before trend claims." />
      <Card title="Cohort A — Speaking" meta="32 students · 3 sessions">
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>Cohort strongest: Audience Addressing (VG median).</li>
          <li>Needs work: Counter Arguments (G median) — matches pilot recommendations.</li>
        </ul>
      </Card>
    </div>
  );
}
