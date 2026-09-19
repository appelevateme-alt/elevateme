"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow, ContentSection } from "@/components/ui/Structure";
import { FilterBar } from "@/components/ui/Data";
import { Field, Select } from "@/components/ui/Field";
import { InsightItem, PerformanceChartBlock } from "@/components/domain/Domain";
import { mockEvaluations } from "@/lib/mock-data";

// Performance page: exactly two principal sections (§10.9).
export default function StudentPerformance() {
  const [skill, setSkill] = useState("overall");
  const [period, setPeriod] = useState("last-4");
  const [program, setProgram] = useState("all");
  const [session, setSession] = useState("all");

  const released = mockEvaluations.filter((e) => e.released);
  const filteredOut = program === "p-mun" && skill === "wit"; // mock filtered-empty demo
  const hasEvaluations = released.length > 0;

  return (
    <div>
      <Eyebrow>Performance</Eyebrow>
      <PageHeader title="Performance" description="Released evaluations only. Graphs first, then evidence-based insights." />

      <ContentSection>
        <h2 className="em-section-title">Section 1 — Performance graphs</h2>
        <div className="mt-3">
          <FilterBar>
            <Field label="Skill">
              <Select value={skill} onChange={(e) => setSkill(e.target.value)} className="sm:w-44">
                <option value="overall">Overall average</option>
                <option value="confidence">Confidence</option>
                <option value="counter">Counter Arguments</option>
                <option value="wit">Wit</option>
              </Select>
            </Field>
            <Field label="Time period">
              <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="sm:w-44">
                <option value="last-4">Last 4 sessions</option>
                <option value="last-8">Last 8 sessions</option>
                <option value="all">All time</option>
              </Select>
            </Field>
            <Field label="Program">
              <Select value={program} onChange={(e) => setProgram(e.target.value)} className="sm:w-52">
                <option value="all">All programs</option>
                <option value="p-speaking">Speaking Cohort A</option>
                <option value="p-mun">MUN Colombo 2026</option>
              </Select>
            </Field>
            <Field label="Session">
              <Select value={session} onChange={(e) => setSession(e.target.value)} className="sm:w-44">
                <option value="all">All sessions</option>
                <option value="s3">Session 3</option>
                <option value="s4">Session 4</option>
              </Select>
            </Field>
          </FilterBar>
        </div>
        <div className="mt-4">
          {!hasEvaluations ? (
            <EmptyState title="No evaluations yet" body="Released results will appear here after your first evaluated session." />
          ) : filteredOut ? (
            <EmptyState
              title="No data for these filters"
              body="Nothing matches this skill + program combination. Try widening the filters."
              action={<Button variant="secondary" onClick={() => { setSkill("overall"); setProgram("all"); }}>Clear filters</Button>}
            />
          ) : (
            <PerformanceChartBlock />
          )}
        </div>
        {hasEvaluations && (
          <p className="em-meta mt-3">
            Detail per sheet: <Link href="/student/performance/e-1" className="font-semibold text-[#1d4ed8]">Open latest released evaluation</Link>
          </p>
        )}
      </ContentSection>

      <ContentSection>
        <h2 className="em-section-title">Section 2 — Your Insights</h2>
        <p className="em-meta mt-0.5">Deterministic rules · minimum 3 evaluations · no fabricated trends.</p>
        <ul className="mt-2">
          <InsightItem
            tone="Strength"
            label="Strongest skill — Audience Addressing"
            statement="Very Good across your last three released sessions."
            evidence="Sessions 2–4, Speaking Cohort A."
          />
          <InsightItem
            tone="Improving"
            label="Most improved — Confidence"
            statement="Confidence increased from 3.0 to 4.0 across four sessions."
            evidence="Sessions 1–4, overall average."
            action={<Link href="/student/recommendations"><Button variant="secondary">View related recommendation</Button></Link>}
          />
          <InsightItem
            tone="Insufficient data"
            label="Counter Arguments — not enough evidence"
            statement="Only 2 of the required 3 released evaluations exist, so no trend is claimed."
            evidence="Sessions 3–4."
          />
        </ul>
      </ContentSection>
    </div>
  );
}
