import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { mockThreadDetails } from "@/lib/mock-data";

export default function AdminMessages() {
  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Messages" description="Parent ↔ Diplomatic Impact records. Same bordered-record pattern, scoped to linked students." />
      <div className="border-t border-gray-200">
        {mockThreadDetails.map((t) => (
          <article key={t.id} className="flex flex-col gap-1 border-b border-gray-200 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="em-item-title">{t.subject}</p>
              <p className="em-meta">{t.studentName} · {t.updatedAt} · {t.replies.length} repl{t.replies.length === 1 ? "y" : "ies"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge value={t.state} />
              <Link href={`/parent/messages/${t.id}`}><Button variant="secondary">Open record</Button></Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
