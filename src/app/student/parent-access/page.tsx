import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Badge } from "@/components/ui/Badge";

export default function ParentAccess() {
  return (
    <div>
      <PageHeader title="Parent Access" description="Invite a parent via time-limited invitation — never open ID lookup." action={<Button>Issue invitation</Button>} />
      <Card title="Linked parent" meta="Invitation accepted" action={<Badge value="Approved" />}>
        <p className="text-sm text-gray-700">Nimal Perera · nimal@example.com · sees same released data as student (per your decision).</p>
      </Card>
    </div>
  );
}
