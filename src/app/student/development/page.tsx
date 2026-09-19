import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState } from "@/components/ui/Page";

export default function StudentDevelopment() {
  return (
    <div>
      <PageHeader title="Further Development" description="Follow-on programs matched to your insights (Phase 4+)." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Suggested next" meta="Based on Counter Arguments insight">
          <p className="text-sm text-gray-600">Friendly Debate — Motion Night. One evaluation round, rebuttal-heavy format.</p>
        </Card>
        <EmptyState title="No enrolments yet" body="Completed development actions will be tracked here after Phase 4." />
      </div>
    </div>
  );
}
