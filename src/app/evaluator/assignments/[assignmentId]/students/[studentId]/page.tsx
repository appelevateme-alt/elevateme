"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow, StickyActionBar } from "@/components/ui/Structure";
import { Alert, ConfirmDialog, Toast } from "@/components/ui/Feedback";
import { CriterionScoreInput } from "@/components/domain/Domain";
import { TEN_CRITERIA, type ScoreLevel } from "@/lib/types";
import { mockRegistrations, mockSessions } from "@/lib/mock-data";

// Per-student evaluation form (§10.8): sticky context, ten rows with rubric +
// level selector + help, keyboard-friendly, remarks after scoring, sticky
// actions, lock confirmation, unsaved-change protection, large touch targets.
export default function PerStudentEvaluatePage() {
  const params = useParams<{ assignmentId: string; studentId: string }>();
  const session = mockSessions.find((s) => s.id === params.assignmentId) ?? mockSessions[0];
  const roster = mockRegistrations;
  const idx = Math.max(0, roster.findIndex((r) => r.elevateMeId === params.studentId));
  const student = roster[idx] ?? roster[0];

  const [scores, setScores] = useState<Record<string, ScoreLevel>>({});
  const [remarks, setRemarks] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [locked, setLocked] = useState(false);
  const [toast, setToast] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !locked) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, locked]);

  const prev = roster[idx - 1];
  const next = roster[idx + 1];
  const scored = Object.keys(scores).length;

  const submit = () => {
    const missing = TEN_CRITERIA.filter((c) => !scores[c.key]).map((c) => c.label);
    if (missing.length > 0) {
      setErrors([`${missing.length} criteria unscored: ${missing.join(", ")}.`]);
      return;
    }
    setErrors([]);
    setConfirming(true);
  };

  return (
    <div>
      <Eyebrow>Evaluation · {session.title}</Eyebrow>
      <PageHeader
        title={`${student.studentName} · ${student.elevateMeId}`}
        description={`${session.title} · ${session.date} · Template v1 · ${student.evaluationState}`}
      />
      {locked ? (
        <Alert tone="success" title="Evaluation submitted and locked">
          This sheet is now <strong>Locked</strong>. Any reopen must be requested from an authorized
          coordinator or admin and is audited.
          <div className="mt-2 flex gap-2">
            {next && <Link href={`/evaluator/assignments/${session.id}/students/${next.elevateMeId}`}><Button variant="secondary">Next student →</Button></Link>}
            <Link href={`/evaluator/assignments/${session.id}`}><Button variant="ghost">Back to assignment</Button></Link>
          </div>
        </Alert>
      ) : (
        <>
          <div className="sticky top-0 z-10 border-y border-gray-200 bg-white/95 py-2 backdrop-blur">
            <p className="text-sm"><strong>{student.studentName}</strong> · {session.title} · {scored}/10 scored{dirty ? " · unsaved changes" : ""}</p>
          </div>
          {errors.length > 0 && (
            <div role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <ul className="list-disc pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          <Card title="Ten criteria" meta="Each row: criterion, one-line rubric, level selector">
            {TEN_CRITERIA.map((c) => (
              <CriterionScoreInput
                key={c.key}
                criterionKey={c.key}
                label={c.label}
                rubric={c.help}
                value={scores[c.key] ?? ""}
                onChange={(v) => { setScores((s) => ({ ...s, [c.key]: v })); setDirty(true); }}
              />
            ))}
            <div className="mt-4 flex flex-col gap-4">
              <Field label="Evaluator remarks" hint="Shared with student and parent after release.">
                <textarea className="min-h-24 w-full rounded border border-gray-300 p-3 text-sm" value={remarks} onChange={(e) => { setRemarks(e.target.value); setDirty(true); }} placeholder="Strengths, development areas…" />
              </Field>
              <Field label="Private admin note (optional)" hint="Staff-only. Never shown to student or parent.">
                <textarea className="min-h-20 w-full rounded border border-gray-300 p-3 text-sm" value={privateNote} onChange={(e) => { setPrivateNote(e.target.value); setDirty(true); }} placeholder="Optional…" />
              </Field>
            </div>
          </Card>
          <StickyActionBar>
            <Button variant="secondary" onClick={() => { setDirty(false); setToast("Draft saved — input preserved."); }}>Save draft</Button>
            <Button onClick={submit}>Submit evaluation</Button>
            {prev && <Link href={`/evaluator/assignments/${session.id}/students/${prev.elevateMeId}`}><Button variant="ghost">← Previous</Button></Link>}
            {next && <Link href={`/evaluator/assignments/${session.id}/students/${next.elevateMeId}`}><Button variant="ghost">Next →</Button></Link>}
          </StickyActionBar>
        </>
      )}
      <ConfirmDialog
        open={confirming}
        title="Submit this evaluation?"
        body="Submitting locks the sheet. The student sees it only after admin release. Validation passed for all ten criteria."
        confirmLabel="Submit and lock"
        onConfirm={() => { setConfirming(false); setLocked(true); setDirty(false); setToast("Evaluation submitted and locked."); }}
        onCancel={() => setConfirming(false)}
      />
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
