"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import type { Session } from "@/lib/types";

// Registration panel: relevant choices only, confirmation summary, exact
// post-submission state. Failed requests preserve input (§11).
export function RegistrationPanel({
  programTitle,
  sessions,
  closed,
}: {
  programTitle: string;
  sessions: Session[];
  closed: boolean;
}) {
  const [choice, setChoice] = useState(sessions[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (closed) {
    return <Alert tone="warning" title="Registration closed">This program is no longer accepting registrations.</Alert>;
  }

  if (submitted) {
    const session = sessions.find((s) => s.id === choice);
    return (
      <Alert tone="success" title="Registration pending">
        Your request for <strong>{programTitle}</strong>
        {session && <> — <strong>{session.title}</strong></>} is <strong>Pending</strong>.
        A coordinator will confirm or waitlist it; you will be notified of the outcome.
      </Alert>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setError("");
        setSubmitting(true);
        // Mock mutation: capacity validation would come from the API.
        setTimeout(() => {
          setSubmitting(false);
          if (!choice) {
            setError("Choose a session or committee before submitting. Your selection is preserved.");
            return;
          }
          setSubmitted(true);
        }, 600);
      }}
    >
      {sessions.length > 0 && (
        <Field label="Choose session / committee" hint="Only choices valid for this program type are shown.">
          <Select value={choice} onChange={(e) => { setChoice(e.target.value); setConfirming(false); }}>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.title} — {s.date}</option>
            ))}
          </Select>
        </Field>
      )}
      {confirming && (
        <Alert tone="info" title="Confirm your registration">
          {programTitle}
          {sessions.find((s) => s.id === choice) && <> — {sessions.find((s) => s.id === choice)?.title}</>}.
          Submitting creates a <strong>Pending</strong> registration for coordinator confirmation.
        </Alert>
      )}
      {error && <Alert tone="danger" title="Could not submit">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : confirming ? "Confirm registration" : "Join this program"}
        </Button>
        {confirming && (
          <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Back</Button>
        )}
      </div>
      <p className="em-meta">Sign-in with a student profile is required. Duplicate, capacity, and eligibility checks run on submit.</p>
    </form>
  );
}
