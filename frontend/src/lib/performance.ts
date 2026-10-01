// Phase 4 performance helpers — pure, unit-tested.
// Filters in URL query (shared URL still requires auth via RequireAuth).
// Time: session date UTC store, Asia/Colombo display; custom inclusive -> half-open UTC (backend).

import { CRITERIA_10 } from './scoring';
import { sortInsightsBySpecOrder, insightRank } from './insights';
import { toColomboDisplay } from './time';
import type { PeriodKey } from './time';

// Canonical insight ordering lives in ./insights (single source of truth).
// Re-exported here for backwards compat (performance.test.ts imports from this module).
export { sortInsightsBySpecOrder, insightRank };

export interface PerformanceFilters {
  criterion: string;
  period: PeriodKey;
  customStart?: string;
  customEnd?: string;
  programId?: string;
  subtype?: string;
  sessionId?: string;
  mode: 'bar' | 'line';
}

export const PERFORMANCE_PERIODS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'last4w', label: 'Last 4 weeks' },
  { value: '3m', label: 'Last 3 months' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

export const DEFAULT_PERFORMANCE_FILTERS: PerformanceFilters = {
  criterion: 'clarity',
  period: 'all',
  programId: '',
  subtype: '',
  sessionId: '',
  mode: 'bar',
};

const VALID_PERIODS: PeriodKey[] = ['last4w', '3m', 'all', 'custom'];

export function isValidCriterion(c: string): boolean {
  return (CRITERIA_10 as readonly string[]).includes(c);
}

/** Normalize criterion for backend: 10 keys pass through, Overall Points -> omit (null). */
export function normalizeCriterionParam(criterion: string): string | null {
  const c = (criterion ?? '').trim();
  if (!c) return null;
  if (/^overall(\s|_|$)/i.test(c) || c.toLowerCase() === 'all') return null;
  const lower = c.toLowerCase();
  if ((CRITERIA_10 as readonly string[]).includes(lower)) return lower;
  return lower;
}

/**
 * Filter param builder -> backend query string.
 * Maps: criterion, period (last4w|3m|all|custom), from/to (custom YYYY-MM-DD),
 * program, subtype, session. Mode is display-only (kept in URL, not sent).
 */
export function buildPerformanceParams(f: PerformanceFilters): string {
  const p = new URLSearchParams();
  const crit = normalizeCriterionParam(f.criterion);
  if (crit) p.set('criterion', crit);
  const period = VALID_PERIODS.includes(f.period) ? f.period : 'all';
  if (period !== 'all') p.set('period', period);
  if (period === 'custom') {
    if (f.customStart?.trim()) p.set('from', f.customStart.trim());
    if (f.customEnd?.trim()) p.set('to', f.customEnd.trim());
  }
  if (f.programId?.trim()) p.set('program', f.programId.trim());
  if (f.subtype?.trim()) p.set('subtype', f.subtype.trim());
  if (f.sessionId?.trim()) p.set('session', f.sessionId.trim());
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Full URL persistence (filters + display mode + custom dates). Shared URL still requires auth. */
export function performanceSearchFrom(f: PerformanceFilters): string {
  const p = new URLSearchParams();
  p.set('criterion', (f.criterion || 'clarity').toLowerCase());
  p.set('period', VALID_PERIODS.includes(f.period) ? f.period : 'all');
  if (f.period === 'custom') {
    if (f.customStart) p.set('from', f.customStart);
    if (f.customEnd) p.set('to', f.customEnd);
  }
  if (f.programId) p.set('program', f.programId);
  if (f.subtype) p.set('subtype', f.subtype);
  if (f.sessionId) p.set('session', f.sessionId);
  p.set('mode', f.mode === 'line' ? 'line' : 'bar');
  return `?${p.toString()}`;
}

/** Parse URL query -> filters with defaults (Clarity / all time / all sessions / bar). */
export function parsePerformanceSearch(search: string): PerformanceFilters {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawCrit = (q.get('criterion') || 'clarity').toLowerCase();
  const criterion = isValidCriterion(rawCrit) ? rawCrit : 'clarity';
  const rawPeriod = (q.get('period') || 'all').toLowerCase() as PeriodKey;
  const period: PeriodKey = VALID_PERIODS.includes(rawPeriod) ? rawPeriod : 'all';
  const mode = q.get('mode') === 'line' ? 'line' : 'bar';
  return {
    criterion,
    period,
    customStart: q.get('from') ?? q.get('customStart') ?? '',
    customEnd: q.get('to') ?? q.get('customEnd') ?? '',
    programId: q.get('program') ?? q.get('programId') ?? '',
    subtype: q.get('subtype') ?? '',
    sessionId: q.get('session') ?? q.get('sessionId') ?? '',
    mode,
  };
}

// ------------------------------------------------------------------
// Chart data mapping: no averaging, chronological, Y 0-100, same-day separate.
// ------------------------------------------------------------------

export interface PerformanceRow {
  evaluationId: string;
  sessionId?: string | null;
  sessionName?: string | null;
  programName?: string | null;
  programId?: string | null;
  subtype?: string | null;
  startsAt?: string | null;
  starts_at?: string | null;
  scores?: Record<string, number>;
  total?: number;
  normalized?: number;
}

export interface ChartPoint {
  label: string;
  value: number;
  event: string;
  date: string;
  score: number;
  evaluationId: string;
  sessionId: string;
}

function rowStartsAt(r: PerformanceRow): string {
  return r.startsAt ?? r.starts_at ?? '';
}

function rowNormalized(r: PerformanceRow): number {
  if (typeof r.normalized === 'number') return r.normalized;
  if (typeof r.total === 'number') return r.total / 10;
  const vals = Object.values(r.scores ?? {});
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Chronological sort: starts_at ASC, tie-break evaluationId ASC. Never averages. */
export function sortPerformanceRows<T extends PerformanceRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(rowStartsAt(a) || '');
    const tb = Date.parse(rowStartsAt(b) || '');
    const na = Number.isNaN(ta) ? 0 : ta;
    const nb = Number.isNaN(tb) ? 0 : tb;
    if (na !== nb) return na - nb;
    return String(a.evaluationId ?? '').localeCompare(String(b.evaluationId ?? ''));
  });
}

function pointLabel(r: PerformanceRow, index: number, seen: Map<string, number>): string {
  const date = rowStartsAt(r) ? toColomboDisplay(rowStartsAt(r)) : 'Undated';
  const name = (r.sessionName || r.programName || 'Session').trim() || 'Session';
  // Same-day sessions stay separate: disambiguate duplicate date+name with #n.
  const base = `${name} · ${date}`;
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  void index;
  return count > 1 ? `${base} (${count})` : base;
}

function pointEvent(r: PerformanceRow): string {
  const parts = [r.programName, r.sessionName].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : 'Session';
}

/** Criterion chart data: one point per session (actual score, never interpolated/averaged).
 * Blank != zero: rows missing this criterion are SKIPPED (never coerced to 0),
 * matching backend released-complete semantics (0 is real only when present). */
export function toCriterionChartData(rows: PerformanceRow[], criterion: string): ChartPoint[] {
  const sorted = sortPerformanceRows(rows);
  const seen = new Map<string, number>();
  const out: ChartPoint[] = [];
  sorted.forEach((r, i) => {
    const v = r.scores?.[criterion];
    // blank != zero: skip missing (do not coerce to 0); 0 when present is real.
    if (typeof v !== 'number') return;
    const value = v;
    const date = rowStartsAt(r) ? toColomboDisplay(rowStartsAt(r)) : '';
    out.push({
      label: pointLabel(r, i, seen),
      value,
      event: pointEvent(r),
      date,
      score: value,
      evaluationId: r.evaluationId,
      sessionId: String(r.sessionId ?? ''),
    });
  });
  return out;
}

/** Overall Points by Session: one point per session using normalized (total/10). */
export function toOverallChartData(rows: PerformanceRow[]): ChartPoint[] {
  const sorted = sortPerformanceRows(rows);
  const seen = new Map<string, number>();
  return sorted.map((r, i) => {
    const value = rowNormalized(r);
    const date = rowStartsAt(r) ? toColomboDisplay(rowStartsAt(r)) : '';
    return {
      label: pointLabel(r, i, seen),
      value,
      event: pointEvent(r),
      date,
      score: value,
      evaluationId: r.evaluationId,
      sessionId: String(r.sessionId ?? ''),
    };
  });
}

/** Y axis is always 0-100. */
export function chartYDomain(): [number, number] {
  return [0, 100];
}

/** Personal best = max normalized across rows (null when empty). */
export function personalBestOfRows(rows: PerformanceRow[]): number | null {
  if (rows.length === 0) return null;
  return Math.max(...rows.map(rowNormalized));
}

/** Based-on scope label (mirrors backend TimeWindow.scopeLabel). */
export function scopeLabelForPeriod(period: PeriodKey, from?: string, to?: string): string {
  switch (period) {
    case 'last4w':
      return 'last 4 weeks';
    case '3m':
      return 'last 3 months';
    case 'custom':
      return `custom ${from ?? ''} to ${to ?? ''}`.trim();
    default:
      return 'all time';
  }
}

// ------------------------------------------------------------------
// Insights order: see sortInsightsBySpecOrder in ./insights.ts (canonical).
// (Rank table intentionally not duplicated here.)
// ------------------------------------------------------------------
