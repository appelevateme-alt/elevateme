import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert } from "@/components/ui/Feedback";
import { mockRecommendations } from "@/lib/mock-data";

function StudentBanner({ studentId }: { studentId: string }) {
  return (
    <Alert tone="info" title={`Viewing: Amaya Perera · ${studentId}`}>
      Linked via verified invitation. One student linked — selector appears only with more than one.
    </Alert>
  );
}

export default async function ParentStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Eyebrow>Linked student</Eyebrow>
        <PageHeader title="Amaya Perera" description={`${studentId} · Colombo International College`} />
      </div>
      <StudentBanner studentId={studentId} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Performance" meta="Released only">
          <p className="text-sm text-gray-600">Overall trend and criterion comparison.</p>
          <div className="mt-2"><Link href={`/parent/students/${studentId}/performance`}><Button variant="secondary">Open performance</Button></Link></div>
        </Card>
        <Card title="Recommendations" meta={`${mockRecommendations.length} active`} action={<Badge value="New" />}>
          <p className="text-sm text-gray-600">{mockRecommendations[0].title}</p>
          <div className="mt-2"><Link href={`/parent/students/${studentId}/recommendations`}><Button variant="secondary">Open recommendations</Button></Link></div>
        </Card>
        <Card title="Messages" meta="Request/reply">
          <p className="text-sm text-gray-600">Exchange scoped records with Diplomatic Impact.</p>
          <div className="mt-2"><Link href="/parent/messages"><Button variant="secondary">Open messages</Button></Link></div>
        </Card>
      </div>
    </div>
  );
}
