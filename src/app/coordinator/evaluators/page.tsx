import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";

export default function CoordinatorEvaluators() {
  return (
    <div>
      <PageHeader title="Evaluators" description="Invite by email → signed, expiring, single-purpose link → scoped workspace." action={<Button>Invite evaluator</Button>} />
      <Card title="Assignments" meta="Phase 3 full workflow">
        <Table headers={["Evaluator", "Session", "Access"]} rows={[[ "David Mensah", "UNHRC — Committee A", <Badge key="e1" value="Approved" /> ]]} />
      </Card>
    </div>
  );
}
