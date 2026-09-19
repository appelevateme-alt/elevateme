"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { FilterBar } from "@/components/ui/Data";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { ApprovalRecord } from "@/components/domain/Domain";
import { Alert, ConfirmDialog, Toast } from "@/components/ui/Feedback";
import { mockPrograms } from "@/lib/mock-data";

// Approval queue (§10.13): compact count line, filters, two-column detail,
// Approve / Request changes / Reject with required note, visibility confirmation.
export default function ApprovalsPage() {
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<null | { action: string; title: string }>(null);
  const [toast, setToast] = useState("");
  const [decided, setDecided] = useState<Record<string, string>>({});

  const items = mockPrograms.filter((p) => {
    if (type !== "all" && (p.singleEventType ?? p.category) !== type) return false;
    if (query && !p.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const act = (action: string, title: string) => {
    if ((action === "Request changes" || action === "Reject") && !note.trim()) {
      setToast("A note is required for Request changes and Reject.");
      return;
    }
    setConfirm({ action, title });
  };

  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Approval queue" description="1 program + 2 accounts awaiting review. Approving changes visibility or access." />
      <FilterBar>
        <Field label="Request type">
          <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-52">
            <option value="all">Programs + accounts</option>
            <option value="ModelUN">Model UN</option>
            <option value="FriendlyDebate">Friendly Debate</option>
            <option value="ContinuousProgramme">Continuous Programme</option>
          </Select>
        </Field>
        <Field label="Search">
          <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Program or institute" className="sm:w-64" />
        </Field>
      </FilterBar>
      <Field label="Review note (required for Request changes / Reject)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Add venue and capacity before approval" />
      </Field>
      <div className="mt-4 flex flex-col gap-4">
        {items.length === 0 ? (
          <EmptyState title="Queue is clear" body="No requests match these filters." action={<Button variant="secondary" onClick={() => { setType("all"); setQuery(""); }}>Clear filters</Button>} />
        ) : (
          items.map((p) => (
            <ApprovalRecord
              key={p.id}
              title={p.title}
              meta={`${p.institute} · submitted Sep 10 · ${p.status}`}
              submitted={<p>{p.description}<br /><span className="em-meta">{p.registered}/{p.capacity} · {p.startDate} → {p.endDate}</span></p>}
              review={
                <div className="flex flex-col gap-2">
                  <span><Badge value={decided[p.id] ?? p.status} /></span>
                  <span className="em-meta">Check eligibility, capacity, venue, and safeguarding notes before deciding.</span>
                </div>
              }
              actions={
                <>
                  <Button onClick={() => act("Approve", p.title)}>Approve</Button>
                  <Button variant="secondary" onClick={() => act("Request changes", p.title)}>Request changes</Button>
                  <Button variant="ghost" onClick={() => act("Reject", p.title)}>Reject</Button>
                </>
              }
            />
          ))
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={`${confirm?.action}: ${confirm?.title}?`}
        body={confirm?.action === "Approve" ? "The program becomes Published and visible in the public directory and student app." : `The coordinator sees your note: “${note || "(no note)"}”. A note is required for this action.`}
        confirmLabel={confirm?.action ?? "Confirm"}
        onConfirm={() => {
          if (confirm) setDecided((d) => ({ ...d, [mockPrograms.find((p) => p.title === confirm.title)?.id ?? confirm.title]: confirm.action === "Approve" ? "Approved" : confirm.action === "Reject" ? "Rejected" : "ChangesRequested" }));
          setToast(`${confirm?.action} recorded with audit entry.`);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
      <Alert tone="info" title="Audit">Every approval, change request, and rejection is recorded with actor, timestamp, and note.</Alert>
    </div>
  );
}
