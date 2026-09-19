"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChartFrame, MetricLine } from "@/components/ui/Data";
import type { Program, ScoreLevel } from "@/lib/types";

// Flat program row separated by rules — not a card (§10.1).
export function ProgramRow({ program }: { program: Program }) {
  const closed = program.status === "RegistrationClosed";
  return (
    <article className="flex flex-col gap-1 border-b border-gray-200 py-4 last:border-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="em-meta">{program.startDate} · {program.singleEventType ?? program.category} · {program.institute}</p>
        <h3 className="em-item-title">
          <Link href={`/programs/${program.id}`} className="hover:underline">{program.title}</Link>
        </h3>
        <p className="mt-0.5 text-sm text-gray-600">{program.description}</p>
        <p className="em-meta mt-1">{program.registered}/{program.capacity} registered</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge value={program.status} />
        <Link href={`/programs/${program.id}`}>
          <Button variant="secondary" disabled={closed}>{closed ? "Registration closed" : "View details"}</Button>
        </Link>
      </div>
    </article>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
      {role}
    </span>
  );
}

// Keyboard-friendly score selector: radio group with large touch targets (§10.8).
const LEVEL_HELP: Record<ScoreLevel, string> = {
  L: "Limited",
  G: "Good",
  VG: "Very Good",
  E: "Excellent",
};

export function CriterionScoreInput({
  criterionKey,
  label,
  rubric,
  value,
  onChange,
}: {
  criterionKey: string;
  label: string;
  rubric: string;
  value: ScoreLevel | "";
  onChange: (v: ScoreLevel) => void;
}) {
  const levels: ScoreLevel[] = ["L", "G", "VG", "E"];
  return (
    <fieldset className="border-b border-gray-100 py-3 last:border-0">
      <legend className="em-item-title">{label}</legend>
      <p className="em-meta">{rubric}</p>
      <div role="radiogroup" aria-label={`${label} score`} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {levels.map((level) => {
          const selected = value === level;
          return (
            <label
              key={level}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded border px-3 text-sm font-semibold ${
                selected ? "border-[#1d4ed8] bg-blue-50 text-[#1d4ed8]" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name={`score-${criterionKey}`}
                value={level}
                checked={selected}
                onChange={() => onChange(level)}
                className="sr-only"
              />
              <span aria-hidden={false}>{level}</span>
              <span className="sr-only">{LEVEL_HELP[level]}</span>
              <span aria-hidden className="text-xs font-normal text-gray-500">{LEVEL_HELP[level]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Lightweight SVG trend chart (no new dependency for the mock): line + points,
// always paired with ChartFrame text summary + data table.
export function PerformanceTrendChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 560;
  const H = 180;
  const PAD = 28;
  const max = 5;
  const min = 1;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" aria-hidden="true" focusable="false">
      {[1, 2, 3, 4, 5].map((g) => (
        <line key={g} x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} stroke="#e5e7eb" strokeWidth={1} />
      ))}
      <path d={path} fill="none" stroke="#1d4ed8" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r={5} fill="#1d4ed8" stroke="#fff" strokeWidth={2} />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#6b7280">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export function PerformanceChartBlock() {
  const points = [
    { label: "S1", value: 3 },
    { label: "S2", value: 3.5 },
    { label: "S3", value: 3 },
    { label: "S4", value: 4 },
  ];
  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
        <MetricLine label="Latest value" value="4.0 (Very Good)" hint="Session 4" />
        <MetricLine label="Change" value="+1.0" hint="across last four sessions" />
        <MetricLine label="Evaluations" value="4 released" hint="min 3 for trends" />
      </div>
      <ChartFrame
        title="Overall average trend"
        summary="Confidence improved from 3.0 to 4.0 across the last four evaluated sessions."
        tableCaption="Overall average by session"
        tableHeaders={["Session", "Average"]}
        tableRows={points.map((p) => [p.label, p.value.toFixed(1)])}
      >
        <PerformanceTrendChart points={points} />
      </ChartFrame>
    </div>
  );
}

export function InsightItem({
  tone,
  label,
  statement,
  evidence,
  action,
}: {
  tone: string;
  label: string;
  statement: string;
  evidence: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="border-b border-gray-200 py-3 last:border-0">
      <p className="em-meta">{tone}</p>
      <p className="em-item-title">{label}</p>
      <p className="mt-0.5 text-sm text-gray-700">{statement}</p>
      <p className="em-meta mt-0.5">Evidence: {evidence}</p>
      {action && <div className="mt-2">{action}</div>}
    </li>
  );
}

export function RecommendationItem({
  title,
  meta,
  action,
  reason,
  footer,
}: {
  title: string;
  meta: string;
  action: string;
  reason: string;
  footer?: React.ReactNode;
}) {
  return (
    <article className="border-b border-gray-200 py-4 last:border-0">
      <h3 className="em-item-title">{title}</h3>
      <p className="em-meta">{meta}</p>
      <p className="mt-1 text-sm text-gray-700"><strong>Action:</strong> {action}</p>
      <p className="mt-0.5 text-sm text-gray-600"><strong>Reason:</strong> {reason}</p>
      {footer && <div className="mt-2 flex flex-wrap items-center gap-2">{footer}</div>}
    </article>
  );
}

export function AnnouncementItem({
  title,
  meta,
  body,
}: {
  title: string;
  meta: string;
  body: string;
}) {
  return (
    <article className="border-b border-gray-200 py-4 last:border-0">
      <h3 className="em-item-title">{title}</h3>
      <p className="em-meta">{meta}</p>
      <p className="mt-1 text-sm text-gray-600">{body}</p>
    </article>
  );
}

// Message as bordered record — never chat bubbles (§10.12).
export function MessageRecord({
  subject,
  meta,
  body,
  replies,
  stateBadge,
  replyForm,
}: {
  subject: string;
  meta: string;
  body: string;
  replies: { author: string; date: string; body: string }[];
  stateBadge: React.ReactNode;
  replyForm?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="em-section-title">{subject}</h2>
          <p className="em-meta">{meta}</p>
        </div>
        {stateBadge}
      </div>
      <div className="mt-3 rounded border border-gray-300 bg-white p-4">
        <p className="text-sm text-gray-800">{body}</p>
      </div>
      {replies.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2">
          {replies.map((r, i) => (
            <li key={i} className="rounded border border-gray-200 bg-gray-50 p-4">
              <p className="em-meta">{r.author} · {r.date}</p>
              <p className="mt-1 text-sm text-gray-800">{r.body}</p>
            </li>
          ))}
        </ol>
      )}
      {replyForm && <div className="mt-4">{replyForm}</div>}
    </div>
  );
}

export function ApprovalRecord({
  title,
  meta,
  submitted,
  review,
  actions,
}: {
  title: string;
  meta: string;
  submitted: React.ReactNode;
  review: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <article className="rounded border border-gray-300 bg-white p-5">
      <h3 className="em-item-title">{title}</h3>
      <p className="em-meta">{meta}</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted information</h4>
          <div className="mt-1 text-sm text-gray-700">{submitted}</div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Review panel</h4>
          <div className="mt-1 text-sm text-gray-700">{review}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
    </article>
  );
}
