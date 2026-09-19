"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert, Toast } from "@/components/ui/Feedback";
import { RecommendationItem } from "@/components/domain/Domain";
import { mockEvaluations, mockRecommendations } from "@/lib/mock-data";

// Admin recommendations (§10.14): list + create with recipient selector,
// evaluation reference (released scores only — never staff-only remarks),
// audience preview before publishing.
export default function AdminRecommendations() {
  const [recipient, setRecipient] = useState("Amaya Perera · EM-00100");
  const [title, setTitle] = useState("");
  const [action, setAction] = useState("");
  const [skill, setSkill] = useState("Counter Arguments");
  const [evaluation, setEvaluation] = useState("e-1");
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState("");

  const ref = mockEvaluations.find((e) => e.id === evaluation);

  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Recommendations" description="Targeted development actions. Compose on the left, live list on the right." />
      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <Card title="Compose" meta="Draft → publish · audience preview required">
          <div className="flex flex-col gap-3">
            <Field label="Recipient">
              <Select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                <option>Amaya Perera · EM-00100</option>
                <option>Speaking Cohort A (32 students)</option>
                <option>Role: all students</option>
              </Select>
            </Field>
            <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Work on counter-arguments" /></Field>
            <Field label="Action"><textarea className="min-h-20 w-full rounded border border-gray-300 p-3 text-sm" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Concrete next step…" /></Field>
            <Field label="Skill">
              <Select value={skill} onChange={(e) => setSkill(e.target.value)}>
                <option>Counter Arguments</option>
                <option>Sound</option>
                <option>Confidence</option>
              </Select>
            </Field>
            <Field label="Related released evaluation (optional)" hint="References released scores only. Staff-only remarks are never exposed.">
              <Select value={evaluation} onChange={(e) => setEvaluation(e.target.value)}>
                {mockEvaluations.filter((e) => e.released).map((e) => (
                  <option key={e.id} value={e.id}>{e.session} (released)</option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPreview(true)}>Preview audience</Button>
              <Button onClick={() => { setToast("Recommendation published and notified."); setPreview(false); }}>Publish</Button>
            </div>
            {preview && (
              <Alert tone="info" title="Audience preview">
                “{title || "(untitled)"}” → {recipient}. Skill: {skill}. Linked evaluation: {ref?.session ?? "none"} (released scores only).
              </Alert>
            )}
          </div>
        </Card>
        <Card title="Live recommendations" meta={`${mockRecommendations.length} targeted`}>
          {mockRecommendations.map((r) => (
            <RecommendationItem
              key={r.id}
              title={r.title}
              meta={`${r.studentName} · ${r.skill} · priority ${r.priority}`}
              action={r.action}
              reason={r.reason}
              footer={<Badge value={r.status} />}
            />
          ))}
          <div className="mt-2">
            <Link href="/admin/announcements"><Button variant="ghost">Manage announcements →</Button></Link>
          </div>
        </Card>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
