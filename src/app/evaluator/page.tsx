import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { MetricLine } from "@/components/ui/Data";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { mockRegistrations, mockSessions } from "@/lib/mock-data";

export default function EvaluatorHome() {
  const total = mockRegistrations.length;
  const submitted = mockRegistrations.filter((r) => r.evaluationState === "Submitted" || r.evaluationState === "Locked").length;

  return (
    <div>
      <Eyebrow>Evaluator workspace</Eyebrow>
      <PageHeader title="Assigned sessions" description="Distraction-free and task-oriented. Scoped access only." />
      <Card title="Completion" meta="Submitted / total across assignments">
        <MetricLine label="Progress" value={`${submitted} / ${total} submitted`} hint="pilot target 95% before deadline" />
      </Card>
      <h2 className="em-section-title mb-2 mt-6">Assignments</h2>
      {mockSessions.length === 0 ? (
        <EmptyState title="No assignments" body="Assigned sessions from coordinators will appear here." />
      ) : (
        <Card title="My assignments" meta={`${mockSessions.length} sessions`}>
          <Table
            headers={["Session", "Date", "Progress", ""]}
            rows={mockSessions.map((s) => [
              s.title,
              s.date,
              <Badge key={`${s.id}-p`} value="Draft" />,
              <Link key={s.id} href={`/evaluator/assignments/${s.id}`}><Button variant="secondary">Open assignment</Button></Link>,
            ])}
          />
        </Card>
      )}
      <p className="em-meta mt-3">Legacy single-form entry remains at <Link href="/evaluator/evaluate" className="font-semibold text-[#1d4ed8]">Evaluation Form</Link>; per-student sheets are now under each assignment.</p>
    </div>
  );
}
