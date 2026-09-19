import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";

export default function ParentPerformance() {
  return (
    <div>
      <PageHeader title="Performance" description="Same released scores and remarks as the student sees." />
      <Card title="Trend (mock)" meta="Phase 4 graphs">
        <p className="text-sm text-gray-600">Overall average trend and criterion comparison will render here once evaluation release is wired.</p>
      </Card>
    </div>
  );
}
