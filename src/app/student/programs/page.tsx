import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { publishedPrograms } from "@/lib/mock-data";

export default function StudentPrograms() {
  return (
    <div>
      <PageHeader title="Programs and Events" description="Approved programs only. Joining creates a Pending registration for coordinator confirmation." />
      <div className="grid gap-4 md:grid-cols-2">
        {publishedPrograms().map((p) => (
          <Card key={p.id} title={p.title} meta={`${p.institute} · ${p.startDate}`} action={<Badge value={p.status} />}>
            <p className="text-sm text-gray-600">{p.description}</p>
            <div className="mt-3 flex gap-2">
              <Link href={`/programs/${p.id}`}><Button variant="secondary">Details</Button></Link>
              <Button>Join program</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
