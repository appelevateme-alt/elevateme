// Deterministic rules engine — spec §6 + docs/INSIGHTS.md. No AI, no branding.
// Order: low score, decline, personal best, improvement, strengths. Top 5 + Expand.
// Scope: caller passes already-filtered evaluations + scope label ("Based on …").
// - Strongest/weakest: rank means per criterion, require 2+ evals, include ties.
// - Most improved: largest positive latest-minus-earliest delta, require 2+,
//   threshold >= +16 (backend InsightsService.IMPROVEMENT_DELTA_AT_LEAST).
// - Recent decline: latest minus immediately preceding <= -7
//   (backend InsightsService.DECLINE_DELTA_AT_MOST; any<0 would over-flag noise).
// Thresholds match backend InsightsService: decline <= -7, improved >= +16.
// Blank != zero: missing criterion scores are skipped (never coerced to 0);
// 0 counts only when present (released-complete semantics).
// - Low score: latest released evaluation has a criterion strictly <30 (30 does NOT alert, 0 does if complete+released).
// - New personal best: current exceeds previous historical best (tie = "matched").
// - Stable: no positive first-to-latest change.

export interface ScopedEvaluation {
  id: string;
  starts_at: string; // ISO UTC actual session start; tie-break by id
  scores: Record<string, number>; // 10 ints 0–100
  normalized: number; // total/10
  released: boolean;
}

export interface Insight { kind: 'low' | 'decline' | 'best' | 'improved' | 'strong' | 'weak' | 'stable' | 'empty'; text: string }

// Match backend InsightsService thresholds: decline <= -7, improved >= +16.
export const DECLINE_DELTA_AT_MOST = -7;
export const IMPROVEMENT_DELTA_AT_LEAST = 16;

function mean(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function insightsFor(
  evals: ScopedEvaluation[],
  criteriaKeys: readonly string[] = [
    'preparation','clarity','confidence','focus','critical_analysis',
    'sound','audience_addressing','counter_arguments','wit','overall_performance',
  ],
): Insight[] {
  const released = [...evals]
    .filter((e) => e.released)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || (a.id < b.id ? -1 : 1));
  if (released.length === 0) return [{ kind: 'empty', text: 'Your first report will start your progress record.' }];
  const out: Insight[] = [];
  const latest = released[released.length - 1];
  const prev = released.length > 1 ? released[released.length - 2] : null;
  const first = released[0];

  // Low score: any criterion in latest strictly <30
  for (const c of criteriaKeys) {
    const v = latest.scores[c];
    if (typeof v === 'number' && v < 30) {
      out.push({ kind: 'low', text: `${label(c)} scored ${v} in your latest evaluation. Review the feedback or ask DI for support.` });
    }
  }

  // Recent decline: overall latest - prev <= -7 (match backend; <0 would over-flag noise)
  if (prev && latest.normalized - prev.normalized <= DECLINE_DELTA_AT_MOST) {
    const d = prev.normalized - latest.normalized;
    out.push({ kind: 'decline', text: `Overall decreased by ${fmt(d)} points, from ${fmt(prev.normalized)} to ${fmt(latest.normalized)}.` });
  }
  // Per-criterion decline example (first qualifying drop found) — no diagnosis.
  // Blank != zero: skip criteria missing in either eval; require drop >= 7.
  if (prev) {
    for (const c of criteriaKeys) {
      const pv = prev.scores[c];
      const lv = latest.scores[c];
      if (typeof pv !== 'number' || typeof lv !== 'number') continue;
      const d = pv - lv;
      if (d >= -DECLINE_DELTA_AT_MOST && out.filter((i) => i.kind === 'decline').length < 2) {
        out.push({ kind: 'decline', text: `${label(c)} decreased by ${fmt(d)} points, from ${lv + d} to ${lv}.` });
        break;
      }
    }
  }

  // New personal best / matched (overall)
  if (released.length > 1) {
    const prevBest = Math.max(...released.slice(0, -1).map((e) => e.normalized));
    if (latest.normalized > prevBest) out.push({ kind: 'best', text: `New personal best: ${fmt(latest.normalized)}/100.` });
    else if (latest.normalized === prevBest) out.push({ kind: 'best', text: `Matched personal best: ${fmt(latest.normalized)}/100.` });
  }

  if (released.length >= 2) {
    // Most improved: largest positive latest-earliest delta, require >= +16.
    // Blank != zero: skip criteria missing in first or latest.
    let bestC = '', bestD = 0;
    for (const c of criteriaKeys) {
      const lv = latest.scores[c];
      const fv = first.scores[c];
      if (typeof lv !== 'number' || typeof fv !== 'number') continue;
      const d = lv - fv;
      if (d > bestD) { bestD = d; bestC = c; }
    }
    if (bestD >= IMPROVEMENT_DELTA_AT_LEAST) out.push({ kind: 'improved', text: `${label(bestC)} improved by ${fmt(bestD)} points from your first to latest session in this period.` });

    // Strongest / weakest by mean (blank != zero: average present scores only).
    const meanEntries = criteriaKeys.flatMap((c) => {
      const vals = released.map((e) => e.scores[c]).filter((v): v is number => typeof v === 'number');
      return vals.length > 0 ? [{ c, m: mean(vals) }] : [];
    });
    const max = Math.max(...meanEntries.map((x) => x.m));
    const min = Math.min(...meanEntries.map((x) => x.m));
    const strong = meanEntries.filter((x) => x.m === max).map((x) => label(x.c)).join(', ');
    const weak = meanEntries.filter((x) => x.m === min).map((x) => label(x.c)).join(', ');
    out.push({ kind: 'strong', text: `${strong} has your highest average: ${fmt(max)} across ${released.length} sessions.` });
    if (min !== max) out.push({ kind: 'weak', text: `${weak} has your lowest average: ${fmt(min)} across ${released.length} sessions.` });

    // Stable: no positive first-to-latest overall change
    if (latest.normalized - first.normalized <= 0 && out.filter((i) => i.kind === 'improved').length === 0) {
      out.push({ kind: 'stable', text: `Your first and latest overall scores in this period are ${fmt(first.normalized)} and ${fmt(latest.normalized)}.` });
    }
  } else {
    // One result: baseline only, plus low-score above if applicable
    out.push({ kind: 'stable', text: `Starting point recorded: ${fmt(latest.normalized)}/100. Your next report will start trends.` });
  }

  // Spec order: low, decline, best, improved, strengths (strong/weak/stable last). Top 5, caller expands rest.
  // Canonical sorter is sortInsightsBySpecOrder below (single source of truth;
  // performance.ts re-exports it — do not duplicate the rank table).
  return sortInsightsBySpecOrder(out).slice(0, 12);
}

function label(key: string): string {
  const map: Record<string, string> = {
    preparation: 'Preparation', clarity: 'Clarity', confidence: 'Confidence', focus: 'Focus',
    critical_analysis: 'Critical Analysis', sound: 'Sound', audience_addressing: 'Audience Addressing',
    counter_arguments: 'Counter Arguments', wit: 'Wit', overall_performance: 'Overall Performance',
  };
  return map[key] ?? key;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ------------------------------------------------------------------
// Canonical insight spec order: low, decline, best, improved, strengths (then rest).
// Single source of truth — performance.ts re-exports these (no duplicate rank tables).
// ------------------------------------------------------------------

const INSIGHT_RANK: Record<string, number> = {
  low: 0,
  decline: 1,
  best: 2,
  improved: 3,
  improvement: 3,
  strengths: 4,
  strength: 4,
  strong: 4,
  weak: 5,
  stable: 5,
  baseline: 6,
  empty: 7,
};

export function insightRank(type: string): number {
  return INSIGHT_RANK[(type ?? '').toLowerCase()] ?? 6;
}

export function sortInsightsBySpecOrder<T extends { type?: string; kind?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = (a as { type?: string }).type ?? (a as { kind?: string }).kind ?? '';
    const tb = (b as { type?: string }).type ?? (b as { kind?: string }).kind ?? '';
    return insightRank(ta) - insightRank(tb);
  });
}
