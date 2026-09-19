"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert, Toast } from "@/components/ui/Feedback";
import { AnnouncementItem } from "@/components/domain/Domain";
import { mockAnnouncements } from "@/lib/mock-data";

// Admin announcements (§10.11/10.14): list + compose with audience, publish
// date, expiry, title, body, link + audience preview before publishing.
export default function AdminAnnouncements() {
  const [audience, setAudience] = useState("All students");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publish, setPublish] = useState("2026-09-20");
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState("");

  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Announcements" description="List, create, schedule, publish, archive. Always preview audience before publishing." />
      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <Card title="Compose" meta="Draft → scheduled → published">
          <div className="flex flex-col gap-3">
            <Field label="Audience">
              <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option>All students</option>
                <option>Cohort A</option>
                <option>Coordinators</option>
                <option>Parents</option>
              </Select>
            </Field>
            <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" /></Field>
            <Field label="Body"><textarea className="min-h-24 w-full rounded border border-gray-300 p-3 text-sm" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Brief message…" /></Field>
            <Field label="Publish date"><TextInput type="date" value={publish} onChange={(e) => setPublish(e.target.value)} /></Field>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPreview(true)}>Preview audience</Button>
              <Button onClick={() => { setToast("Announcement scheduled — plain text only, no raw HTML."); setPreview(false); }}>Schedule</Button>
            </div>
            {preview && (
              <Alert tone="info" title={`Audience preview — ${audience}`}>
                “{title || "(untitled)"}” reaches ~{audience === "All students" ? "119 students + linked parents" : "32 recipients"} on {publish}. No raw HTML is rendered.
              </Alert>
            )}
          </div>
        </Card>
        <Card title="Published" meta={`${mockAnnouncements.length} live`}>
          {mockAnnouncements.map((a) => (
            <AnnouncementItem key={a.id} title={a.title} meta={`${a.sender} · ${a.audience} · ${a.date}`} body={a.body} />
          ))}
        </Card>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
