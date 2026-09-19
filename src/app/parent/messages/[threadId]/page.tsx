"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert, ConfirmDialog } from "@/components/ui/Feedback";
import { Field, TextInput } from "@/components/ui/Field";
import { MessageRecord } from "@/components/domain/Domain";
import { mockThreadDetails } from "@/lib/mock-data";

export default function ThreadDetailPage() {
  const params = useParams<{ threadId: string }>();
  const router = useRouter();
  const thread = mockThreadDetails.find((t) => t.id === params.threadId);
  const [reply, setReply] = useState("");
  const [replies, setReplies] = useState(thread?.replies ?? []);
  const [state, setState] = useState(thread?.state ?? "Open");
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState("");

  if (!thread) {
    return (
      <div>
        <PageHeader title="Message not found" description="This thread does not exist or is not linked to your student." />
        <EmptyState title="Not found" body="Return to the inbox." action={<Button variant="secondary" onClick={() => router.push("/parent/messages")}>Back to inbox</Button>} />
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Message detail</Eyebrow>
      <MessageRecord
        subject={thread.subject}
        meta={`${thread.studentName} · updated ${thread.updatedAt}`}
        body={thread.body}
        replies={replies}
        stateBadge={<Badge value={state} />}
        replyForm={
          state === "Closed" ? (
            <Alert tone="info" title="Thread closed">
              This record is closed. Reopen it to reply.
              <div className="mt-2"><Button variant="secondary" onClick={() => setState("Open")}>Reopen thread</Button></div>
            </Alert>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reply.trim()) {
                  setError("Write a reply before sending. Your draft is preserved.");
                  return;
                }
                setError("");
                setReplies((r) => [...r, { author: "Nimal Perera (parent)", date: "today", body: reply }]);
                setReply("");
                setState("Replied");
              }}
            >
              <Field label="Reply" hint="One reply form at the bottom. No typing indicators or read receipts.">
                <textarea className="min-h-24 w-full rounded border border-gray-300 p-3 text-sm" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write your reply…" />
              </Field>
              {error && <Alert tone="danger" title="Could not send">{error}</Alert>}
              <div className="flex gap-2">
                <Button type="submit">Send reply</Button>
                <Button type="button" variant="secondary" onClick={() => setConfirmClose(true)}>Close thread</Button>
              </div>
            </form>
          )
        }
      />
      <ConfirmDialog
        open={confirmClose}
        title="Close this thread?"
        body="Closing marks the record Closed. Either side can reopen it later."
        confirmLabel="Close thread"
        onConfirm={() => { setConfirmClose(false); setState("Closed"); }}
        onCancel={() => setConfirmClose(false)}
      />
      <div className="mt-4">
        <Field label="Debug (mock)"><TextInput value={`state=${state}`} readOnly aria-label="Thread state" /></Field>
      </div>
    </div>
  );
}
