// Spec §5 exact scoring. INT-only, NO decimals stored.
// 10 criteria in order — keys frozen in docs/SCORING.md + tests/fixtures/scoring.json.
// Sound MUST stay Sound (never Vocal Delivery).

export const CRITERIA_10 = [
  'preparation',
  'clarity',
  'confidence',
  'focus',
  'critical_analysis',
  'sound',
  'audience_addressing',
  'counter_arguments',
  'wit',
  'overall_performance',
] as const;

export const CRITERIA_LABELS: Record<(typeof CRITERIA_10)[number], string> = {
  preparation: 'Preparation',
  clarity: 'Clarity',
  confidence: 'Confidence',
  focus: 'Focus',
  critical_analysis: 'Critical Analysis',
  sound: 'Sound',
  audience_addressing: 'Audience Addressing',
  counter_arguments: 'Counter Arguments',
  wit: 'Wit',
  overall_performance: 'Overall Performance',
};

export type CriterionName = (typeof CRITERIA_10)[number];

export interface ScoredEvaluation {
  id: string;
  studentId: string;
  sessionId?: string;
  createdAt: string; // ISO UTC
  scores: Record<string, number>;
}

export function validateScore(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100;
}

export function validateScores(scores: Record<string, unknown>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const c of CRITERIA_10) {
    const v = (scores as Record<string, unknown>)[c];
    if (v === null || v === undefined) { errors.push(`${c} required`); continue; }
    if (!validateScore(v)) errors.push(`${c} must be int 0-100`);
  }
  return { ok: errors.length === 0, errors };
}

/** Total 0–1000 = sum of 10 ints. Normalized 0–100 = total / 10 (exact, display ≤1dp). */
export function total1000(scores: Record<string, number>): { total: number; normalized: number } {
  let sum = 0;
  for (const c of CRITERIA_10) sum += scores[c] ?? 0;
  return { total: sum, normalized: sum / 10 };
}

/** Provisional total for live sheet feedback (same math, client-side only; server recalculates). */
export function totalOf(scores: Record<string, number>): number {
  return total1000(scores).normalized;
}

export function sortChronological<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export interface ProgressSummary { baseline: number | null; best: number | null; gain: number | null; baselineLabel: string }

export function summarize(totals: number[]): ProgressSummary {
  if (totals.length === 0) return { baseline: null, best: null, gain: null, baselineLabel: 'No baseline yet' };
  const baseline = totals[0];
  const best = Math.max(...totals);
  return { baseline, best, gain: best - baseline, baselineLabel: `Baseline ${baseline}` };
}
