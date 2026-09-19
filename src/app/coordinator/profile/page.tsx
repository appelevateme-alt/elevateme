import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";

export default function CoordinatorProfile() {
  return (
    <div>
      <PageHeader title="Profile" description="Institutional profile. Approval by admin; cannot self-approve." />
      <Card title="Sarah Fernando" meta="Colombo International College" action={<Badge value="Approved" />}>
        <p className="text-sm text-gray-700">Roles: coordinator, evaluator (multi-role enabled). National ID deferred for MVP.</p>
      </Card>
    </div>
  );
}
