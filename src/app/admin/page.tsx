import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { MetricLine } from "@/components/ui/Data";

// Operational overview (§7): compact count line + links, not dashboard cards.
export default function AdminOverview() {
  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader
        title="Operational overview"
        description="1 program + 2 accounts awaiting review · 2 submitted evaluations pending release · 1 open parent thread."
        action={<Link href="/admin/approvals"><Button>Open approval queue</Button></Link>}
      />
      <Card title="Jump to" meta="Full destinations live in the sidebar">
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/programs"><Button variant="secondary">Programs</Button></Link>
          <Link href="/admin/evaluations"><Button variant="secondary">Evaluations</Button></Link>
          <Link href="/admin/announcements"><Button variant="secondary">Announcements</Button></Link>
          <Link href="/admin/messages"><Button variant="secondary">Messages</Button></Link>
          <Link href="/admin/reports"><Button variant="secondary">Reports</Button></Link>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <MetricLine label="Approval queue" value="3 pending" hint="1 program · 2 accounts" />
          <MetricLine label="Evaluations" value="2 submitted" hint="release gate" />
          <MetricLine label="Pilot reports" value="registrations · completion · averages" hint="CSV export with audit" />
        </div>
      </Card>
    </div>
  );
}
