"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert, Progress } from "@/components/ui/Feedback";
import { DefinitionList } from "@/components/ui/Data";

const STEPS = ["Basics", "Schedule and location", "Program structure", "Registration rules", "Media and description", "Review and submit"] as const;

export default function NewProgramPage() {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("SingleEvent");
  const [eventType, setEventType] = useState("ModelUN");
  const [venue, setVenue] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("60");
  const [structure, setStructure] = useState("UNHRC — Committee A; DISEC — Committee B");
  const [description, setDescription] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !submitted) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, submitted]);

  const mark = (fn: () => void) => () => { fn(); setDirty(true); };

  const validate = (s: number): string[] => {
    if (s === 1 && !title.trim()) return ["Enter a program title."];
    if (s === 2 && (!start || !end || !venue.trim())) return ["Enter start date, end date, and venue."];
    if (s === 3 && !structure.trim()) return ["Describe committees, sessions, or tracks."];
    if (s === 4 && (!capacity || Number(capacity) < 1)) return ["Capacity must be at least 1."];
    return [];
  };

  if (submitted) {
    return (
      <div>
        <Eyebrow>Program builder</Eyebrow>
        <PageHeader title="Submitted for approval" description="Your draft entered Submitted → Under Review. Editing is now restricted." />
        <Alert tone="success" title="What happens next">
          An administrator reviews <strong>{title || "your program"}</strong> and approves, requests changes, or rejects it.
          Approved events publish to the public directory and student app.
        </Alert>
        <div className="mt-4 flex gap-2">
          <Link href="/coordinator/programs"><Button variant="secondary">Back to programs</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Program builder</Eyebrow>
      <PageHeader
        title="New program"
        description="Progressive steps. Save draft stays visible; review mirrors the public display."
        action={<Button variant="secondary" onClick={() => { setSavedAt(new Date().toLocaleTimeString()); setDirty(false); }}>Save draft{savedAt ? ` · saved ${savedAt}` : ""}</Button>}
      />
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <ol aria-label="Builder steps" className="hidden flex-col gap-1 md:flex">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                onClick={() => setStep(i + 1)}
                aria-current={step === i + 1 ? "step" : undefined}
                className={`block w-full rounded px-3 py-2 text-left text-sm font-medium ${step === i + 1 ? "bg-blue-50 text-[#1d4ed8]" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
        <div>
          <div className="md:hidden"><Progress value={step} max={STEPS.length} label={STEPS[step - 1]} /></div>
          {errors.length > 0 && (
            <div role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <ul className="list-disc pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          <Card title={STEPS[step - 1]} meta={`Step ${step} of ${STEPS.length}`}>
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <Field label="Title"><TextInput value={title} onChange={mark(() => {})} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="e.g. Model United Nations — Colombo 2026" /></Field>
                <Field label="Category">
                  <Select value={category} onChange={(e) => { setCategory(e.target.value); setDirty(true); }}>
                    <option value="SingleEvent">Single Event</option>
                    <option value="ContinuousProgramme">Continuous Programme</option>
                    <option value="SpecialProgramme">Special Programme</option>
                  </Select>
                </Field>
                {category === "SingleEvent" && (
                  <Field label="Single-event type">
                    <Select value={eventType} onChange={(e) => { setEventType(e.target.value); setDirty(true); }}>
                      <option value="ModelUN">Model United Nations</option>
                      <option value="FriendlyDebate">Friendly Debate</option>
                      <option value="Competition">Competition</option>
                      <option value="Special">Special</option>
                    </Select>
                  </Field>
                )}
              </div>
            )}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <Field label="Venue or online link"><TextInput value={venue} onInput={(e) => setVenue(e.currentTarget.value)} onChange={mark(() => {})} placeholder="Main Hall, Colombo / https://…" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Start date"><TextInput type="date" value={start} onInput={(e) => setStart(e.currentTarget.value)} onChange={mark(() => {})} /></Field>
                  <Field label="End date"><TextInput type="date" value={end} onInput={(e) => setEnd(e.currentTarget.value)} onChange={mark(() => {})} /></Field>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                {category === "SingleEvent" && eventType === "ModelUN" && (
                  <Alert tone="info" title="MUN structure">Add committees plus optional country/portfolio choices.</Alert>
                )}
                {category === "SingleEvent" && eventType === "FriendlyDebate" && (
                  <Alert tone="info" title="Debate structure">Add sessions, motions/topics, teams, and dates.</Alert>
                )}
                {category === "ContinuousProgramme" && (
                  <Alert tone="info" title="Continuous structure">Add recurring sessions, cohort dates, and attendance expectations.</Alert>
                )}
                {category === "SpecialProgramme" && (
                  <Alert tone="info" title="Special programme">Generic structure for MVP — describe the format below.</Alert>
                )}
                <Field label="Committees / sessions / tracks">
                  <textarea className="min-h-24 w-full rounded border border-gray-300 p-3 text-sm" value={structure} onChange={(e) => { setStructure(e.target.value); setDirty(true); }} />
                </Field>
              </div>
            )}
            {step === 4 && (
              <div className="flex flex-col gap-4">
                <Field label="Capacity"><TextInput type="number" min={1} value={capacity} onInput={(e) => setCapacity(e.currentTarget.value)} onChange={mark(() => {})} /></Field>
                <Field label="Eligibility" hint="Validated again on registration."><TextInput placeholder="e.g. Open to all registered students" /></Field>
              </div>
            )}
            {step === 5 && (
              <div className="flex flex-col gap-4">
                <Field label="Cover image" hint="JPG or PNG, max 5 MB."><TextInput type="file" accept="image/png,image/jpeg" /></Field>
                <Field label="Description">
                  <textarea className="min-h-28 w-full rounded border border-gray-300 p-3 text-sm" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} placeholder="Public description, contact, visibility…" />
                </Field>
              </div>
            )}
            {step === 6 && (
              <div>
                <p className="em-meta mb-2">Review mirrors the eventual public display.</p>
                <DefinitionList
                  items={[
                    ["Title", title || "—"],
                    ["Type", category === "SingleEvent" ? eventType : category],
                    ["Schedule", `${start || "—"} → ${end || "—"} · ${venue || "—"}`],
                    ["Capacity", capacity],
                    ["Structure", structure || "—"],
                    ["Description", description || "—"],
                  ]}
                />
              </div>
            )}
            <div className="mt-4 flex justify-between gap-2">
              <Button variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</Button>
              {step < STEPS.length ? (
                <Button
                  onClick={() => {
                    const list = validate(step);
                    setErrors(list);
                    if (list.length === 0) setStep((s) => s + 1);
                  }}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    const all = [1, 2, 3, 4].flatMap(validate);
                    setErrors(all);
                    if (all.length === 0) setSubmitted(true);
                  }}
                >
                  Submit for approval
                </Button>
              )}
            </div>
          </Card>
          {dirty && <p className="em-meta mt-2">Unsaved changes — use Save draft before leaving.</p>}
        </div>
      </div>
    </div>
  );
}
