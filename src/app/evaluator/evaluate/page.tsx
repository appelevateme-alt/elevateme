"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { TEN_CRITERIA, type ScoreLevel } from "@/lib/types";

const LEVELS: ScoreLevel[] = ["L", "G", "VG", "E"];

export default function EvaluatePage() {
  const [scores, setScores] = useState<Record<string, ScoreLevel>>({});

  return (
    <div>
      <PageHeader
        title="Evaluation Form"
        description="Student Performance Sheet — ten criteria. Validate all required criteria before submit. Score meaning: baseline 50 + L/G/VG/E (numeric mapping TBC)."
        action={<Button variant="secondary">Save draft</Button>}
      />
      <Card title="Amaya Perera · EM-00100" meta="UNHRC — Committee A · Template v1 (versioned)">
        <div className="grid gap-4">
          {TEN_CRITERIA.map((c) => (
            <Field key={c.key} label={`${c.label}`} hint={c.help}>
              <Select
                value={scores[c.key] ?? ""}
                onChange={(e) => setScores((s) => ({ ...s, [c.key]: e.target.value as ScoreLevel }))}
                required
              >
                <option value="">Select level…</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </Field>
          ))}
          <Field label="Evaluator remarks" hint="Shared with student and parent after release.">
            <textarea className="min-h-24 w-full rounded border border-gray-300 p-3 text-sm" placeholder="Strengths, development areas…" />
          </Field>
          <Field label="Private admin note" hint="Staff-only. Never shown to student or parent.">
            <textarea className="min-h-20 w-full rounded border border-gray-300 p-3 text-sm" placeholder="Optional…" />
          </Field>
          <div className="flex gap-2">
            <Button>Submit sheet</Button>
            <Button variant="secondary">Save draft</Button>
          </div>
          <p className="em-meta">{Object.keys(scores).length}/10 criteria scored · submitted sheets lock; reopen is audited.</p>
        </div>
      </Card>
    </div>
  );
}
