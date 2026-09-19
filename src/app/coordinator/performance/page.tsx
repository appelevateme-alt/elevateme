import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState } from "@/components/ui/Page";

export default function CoordinatorPerformance() {
  return (
    <div>
      <PageHeader title="Performance" description="Individual and aggregate views for assigned students (Phase 4)." />
      <EmptyState title="No released data yet" body="Individual and cohort aggregates appear once evaluations are released." />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Individual" meta="Per-student trend (mock)"><p className="text-sm text-gray-600">Select a student from the roster to preview their trend.</p></Card>
        <Card title="Aggregate" meta="Average by criterion (mock)"><p className="text-sm text-gray-600">Pilot report: average by criterion across released evaluations.</p></Card>
      </div>
    </div>
  );
}
