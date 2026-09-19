"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert } from "@/components/ui/Feedback";

export default function NewMessagePage() {
  const router = useRouter();
  const [student, setStudent] = useState("EM-00100");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  return (
    <div>
      <Eyebrow>Parent communication</Eyebrow>
      <PageHeader title="New message" description="Conventional form: student, subject, message. Either side can start." />
      <Card title="Compose" meta="Mock — creates record m-new">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!subject.trim() || !body.trim()) {
              setError("Subject and message are required. Your input is preserved.");
              return;
            }
            setError("");
            router.push("/parent/messages/m-2");
          }}
        >
          <Field label="Linked student">
            <Select value={student} onChange={(e) => setStudent(e.target.value)}>
              <option value="EM-00100">Amaya Perera · EM-00100</option>
            </Select>
          </Field>
          <Field label="Subject"><TextInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Session absence — Oct 24" /></Field>
          <Field label="Message"><textarea className="min-h-28 w-full rounded border border-gray-300 p-3 text-sm" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" /></Field>
          {error && <Alert tone="danger" title="Check the form">{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit">Send message</Button>
            <Button type="button" variant="secondary" onClick={() => router.push("/parent/messages")}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
