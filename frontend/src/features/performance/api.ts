import { get } from '../../lib/api';
import { buildPerformanceParams, type PerformanceFilters, type PerformanceRow } from '../../lib/performance';

export type { PerformanceRow };

export interface PerformanceResponse {
  rows: PerformanceRow[];
  scope: { sampleSize: number; period: string; scopeLabel: string; criterion?: string };
}

export interface InsightItem {
  type: string;
  criterionKey?: string;
  criterion?: string;
  criterionLabel?: string;
  label?: string;
  message: string;
  basedOn?: string;
  evidence?: Record<string, unknown>;
  inTop5?: boolean;
}

export interface InsightsResponse {
  insights: InsightItem[];
  top5: InsightItem[];
  all: InsightItem[];
  total: number;
  hasMore: boolean;
  scopeLabel: string;
  scope?: string;
  evidenceWindow: string;
  sampleSize: number;
}

/** GET /me/performance — released rows chronological, never averaged, same-day separate. */
export async function getPerformance(f: PerformanceFilters): Promise<PerformanceResponse> {
  const qs = buildPerformanceParams(f);
  const res = await get<{ rows?: PerformanceRow[]; scope?: PerformanceResponse['scope'] }>(`/me/performance${qs}`);
  return {
    rows: Array.isArray(res.rows) ? res.rows : [],
    scope: res.scope ?? { sampleSize: (res.rows ?? []).length, period: f.period, scopeLabel: 'all time' },
  };
}

/** GET /me/insights — deterministic feed for the same filtered scope. */
export async function getInsights(f: PerformanceFilters): Promise<InsightsResponse> {
  const qs = buildPerformanceParams(f);
  const res = await get<Partial<InsightsResponse> & { insights?: InsightItem[] }>(`/me/insights${qs}`);
  const all = Array.isArray(res.insights) ? res.insights : Array.isArray(res.all) ? res.all : [];
  const top5 = Array.isArray(res.top5) ? res.top5 : all.filter((i) => i.inTop5).slice(0, 5);
  return {
    insights: all,
    top5,
    all,
    total: typeof res.total === 'number' ? res.total : all.length,
    hasMore: typeof res.hasMore === 'boolean' ? res.hasMore : all.length > top5.length,
    scopeLabel: res.scopeLabel ?? (typeof res.scope === 'string' ? res.scope : 'all time'),
    evidenceWindow: res.evidenceWindow ?? (all.length === 0 ? 'no evaluations' : `${all.length} evaluations`),
    sampleSize: typeof res.sampleSize === 'number' ? res.sampleSize : all.length,
  };
}
