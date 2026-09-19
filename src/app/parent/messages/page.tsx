"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { FilterBar } from "@/components/ui/Data";
import { Field, Select } from "@/components/ui/Field";
import { mockThreads } from "@/lib/mock-data";

// Message inbox (§10.12): records with subject/student/sender/date/state,
// filters, conventional new-message form. No chat UI.
export default function ParentMessages() {
  const [filter, setFilter] = useState("all");
  const filtered = mockThreads.filter((t) => filter === "all" || t.state === filter);

  return (
    <div>
      <Eyebrow>Parent communication</Eyebrow>
      <PageHeader
        title="Messages"
        description="Message-and-reply records with Diplomatic Impact — not chat. Viewing: Amaya Perera · EM-00100."
        action={<Link href="/parent/messages/new"><Button>New message</Button></Link>}
      />
      <FilterBar>
        <Field label="State">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-44">
            <option value="all">All states</option>
            <option value="Open">Open</option>
            <option value="Replied">Replied</option>
            <option value="Closed">Closed</option>
          </Select>
        </Field>
      </FilterBar>
      <div className="mt-2 border-t border-gray-200">
        {filtered.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No messages in this state" body="Try a different state filter." action={<Button variant="secondary" onClick={() => setFilter("all")}>Clear filter</Button>} />
          </div>
        ) : (
          filtered.map((t) => (
            <article key={t.id} className="flex flex-col gap-1 border-b border-gray-200 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="em-item-title"><Link href={`/parent/messages/${t.id}`} className="hover:underline">{t.subject}</Link></p>
                <p className="em-meta">{t.studentName} · Diplomatic Impact · {t.updatedAt}</p>
                <p className="text-sm text-gray-600">{t.preview}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge value={t.state} />
                <Link href={`/parent/messages/${t.id}`}><Button variant="secondary">Open</Button></Link>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
