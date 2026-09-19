import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Alert } from "@/components/ui/Feedback";
import { mockRecommendations } from "@/lib/mock-data";

export default function ParentOverview() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageHeader title="Student Overview" description="Amaya Perera · EM-00100 · linked via verified invitation" action={<Link href="/parent/students/EM-00100"><Button variant="secondary">Open student record</Button></Link>} />
      </div>
      <Alert tone="info" title="Viewing: Amaya Perera · EM-00100">One student linked — the selector appears only with more than one linked student.</Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Progress snapshot" meta="Released results only">
          <p className="text-sm text-gray-700">2 programs · 3 released evaluations · strongest: Audience Addressing.</p>
        </Card>
        <Card title="Latest recommendation" meta={mockRecommendations[0].skill} action={<Badge value={mockRecommendations[0].priority} />}>
          <p className="text-sm text-gray-700">{mockRecommendations[0].action}</p>
        </Card>
      </div>
    </div>
  );
}
