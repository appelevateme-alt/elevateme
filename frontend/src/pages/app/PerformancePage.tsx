import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { InsightMessage } from '../../components/InsightMessage';
import { CRITERIA_10, CRITERIA_LABELS } from '../../lib/scoring';
import { toColomboDisplay } from '../../lib/time';
import {
  DEFAULT_PERFORMANCE_FILTERS,
  PERFORMANCE_PERIODS,
  parsePerformanceSearch,
  performanceSearchFrom,
  personalBestOfRows,
  scopeLabelForPeriod,
  sortPerformanceRows,
  toCriterionChartData,
  toOverallChartData,
  type PerformanceFilters,
  type PerformanceRow,
} from '../../lib/performance';
import { getInsights, getPerformance, type InsightItem } from '../../features/performance/api';
import { ApiError } from '../../lib/api';
import styles from './PerformancePage.module.css';

// Recharts ships inside PerformanceChart: lazy-load the chart so the heavy
// chart chunk is fetched only on /app/performance (route-level splitting).
// The data table below renders immediately (a11y + no-JS-chart fallback).
const PerformanceChart = lazy(() =>
  import('../../components/PerformanceChart').then((m) => ({ default: m.PerformanceChart })),
);

/**
 * /app/performance — two sections: Charts + Your Insights.
 * Filters in URL query (shared URL still requires auth).
 * Default: Clarity / all time / all sessions / bar.
 */
export function PerformancePage() {
  const [params, setParams] = useSearchParams();
  const filters: PerformanceFilters = useMemo(
    () => ({ ...DEFAULT_PERFORMANCE_FILTERS, ...parsePerformanceSearch(params.toString()) }),
    [params],
  );

  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [scopeLabel, setScopeLabel] = useState('all time');
  const [evidenceWindow, setEvidenceWindow] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<PerformanceFilters>) {
    const next = { ...filters, ...patch };
    // Leaving custom clears dates; entering custom keeps existing.
    setParams(new URLSearchParams(performanceSearchFrom(next).slice(1)), { replace: false });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [perf, ins] = await Promise.all([getPerformance(filters), getInsights(filters)]);
        if (cancelled) return;
        // Session selector (all/chosen): when a session is chosen, narrow client-side too
        // (backend already filters; this keeps the toggle consistent).
        const narrowed = filters.sessionId
          ? perf.rows.filter((r) => String(r.sessionId ?? '') === filters.sessionId)
          : perf.rows;
        setRows(sortPerformanceRows(narrowed));
        setInsights(ins.all?.length ? ins.all : ins.insights);
        setScopeLabel(ins.scopeLabel || scopeLabelForPeriod(filters.period, filters.customStart, filters.customEnd));
        setEvidenceWindow(ins.evidenceWindow || `${narrowed.length} evaluations`);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load performance.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);

  const criterionData = useMemo(() => toCriterionChartData(rows, filters.criterion), [rows, filters.criterion]);
  const overallData = useMemo(() => toOverallChartData(rows), [rows]);
  const best = useMemo(() => personalBestOfRows(rows), [rows]);

  const sessionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const id = String(r.sessionId ?? r.evaluationId);
      if (!seen.has(id)) seen.set(id, String(r.sessionName ?? r.programName ?? id));
    }
    return [...seen.entries()];
  }, [rows]);

  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const latestVal = latest?.scores?.[filters.criterion] ?? null;
  const change = latestVal != null && prev?.scores?.[filters.criterion] != null
    ? latestVal - (prev.scores[filters.criterion] as number)
    : null;

  const showCustom = filters.period === 'custom';
  const emptyNoEvals = !loading && !error && rows.length === 0;

  return (
    <main className={styles.page} data-testid="page-app-performance">
      <PageHeading title="Performance" desc="Your released results over time." />

      <section className={styles.section} aria-label="Charts">
        <h2>Charts</h2>
        <div className={styles.filters} role="group" aria-label="Chart filters">
          <label className={styles.field}>Criterion
            <select value={filters.criterion} onChange={(e) => update({ criterion: e.target.value })} aria-label="Criterion">
              {CRITERIA_10.map((c) => (
                <option key={c} value={c}>{CRITERIA_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>Period
            <select value={filters.period} onChange={(e) => update({ period: e.target.value as PerformanceFilters['period'] })} aria-label="Period">
              {PERFORMANCE_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          {showCustom && (
            <>
              <label className={styles.field}>From (Colombo)
                <input type="date" value={filters.customStart ?? ''} onChange={(e) => update({ customStart: e.target.value })} aria-label="Custom start" />
              </label>
              <label className={styles.field}>To (Colombo, inclusive)
                <input type="date" value={filters.customEnd ?? ''} onChange={(e) => update({ customEnd: e.target.value })} aria-label="Custom end" />
              </label>
            </>
          )}
          <label className={styles.field}>Program
            <input value={filters.programId ?? ''} onChange={(e) => update({ programId: e.target.value })} placeholder="All programs" aria-label="Program filter" />
          </label>
          <label className={styles.field}>Subtype
            <input value={filters.subtype ?? ''} onChange={(e) => update({ subtype: e.target.value })} placeholder="All subtypes" aria-label="Subtype filter" />
          </label>
          <label className={styles.field}>Session
            <select value={filters.sessionId ?? ''} onChange={(e) => update({ sessionId: e.target.value })} aria-label="Session selector">
              <option value="">All sessions</option>
              {sessionOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>
          <fieldset className={styles.field}>
            <legend>Chart type</legend>
            <div className={styles.toggle} role="radiogroup" aria-label="Bar or line">
              <label>
                <input
                  type="radio"
                  name="chart-mode"
                  value="bar"
                  checked={filters.mode === 'bar'}
                  onChange={() => update({ mode: 'bar' })}
                />
                Bar
              </label>
              <label>
                <input
                  type="radio"
                  name="chart-mode"
                  value="line"
                  checked={filters.mode === 'line'}
                  onChange={() => update({ mode: 'line' })}
                />
                Line
              </label>
            </div>
          </fieldset>
        </div>

        {loading && <p role="status">Loading…</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {!loading && !error && rows.length === 0 && (
          filters.programId || filters.subtype || filters.sessionId || filters.period !== 'all'
            ? <EmptyState title="No data for these filters" body="Try widening the period or clearing program/session filters." />
            : <EmptyState title="No evaluations yet" body="Your first released report will start your progress record." />
        )}
        {!loading && !error && rows.length > 0 && (
          <>
            <p className={styles.stats} data-testid="chart-stats">
              {CRITERIA_LABELS[filters.criterion as keyof typeof CRITERIA_LABELS] ?? filters.criterion}
              {' '}· latest {latestVal ?? '—'}
              {change != null && ` (${change >= 0 ? '+' : ''}${change} vs previous)`}
              {' '}· {rows.length} evaluation{rows.length > 1 ? 's' : ''}
              {' '}· Based on {scopeLabel}
            </p>
            <div className={styles.graph}>
              <h3>{CRITERIA_LABELS[filters.criterion as keyof typeof CRITERIA_LABELS] ?? filters.criterion} by session</h3>
              <Suspense fallback={<p role="status">Loading chart…</p>}>
                <PerformanceChart data={criterionData} mode={filters.mode} caption={`${filters.criterion} scores by session`} />
              </Suspense>
            </div>
            <div className={styles.graph}>
              <h3>Overall Points by Session</h3>
              <Suspense fallback={<p role="status">Loading chart…</p>}>
                <PerformanceChart
                  data={overallData}
                  mode={filters.mode}
                  referenceValue={best}
                  referenceLabel={best != null ? `Personal best ${best}` : undefined}
                  caption="Overall points by session"
                />
              </Suspense>
            </div>
            <table className={styles.table} data-testid="actual-score-table">
              <caption>Actual scores (no averaging; same-day sessions listed separately)</caption>
              <thead>
                <tr><th scope="col">Session</th><th scope="col">Date (Colombo)</th><th scope="col">{CRITERIA_LABELS[filters.criterion as keyof typeof CRITERIA_LABELS] ?? 'Score'}</th><th scope="col">Overall</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const startsAt = r.startsAt ?? r.starts_at ?? '';
                  return (
                    <tr key={r.evaluationId}>
                      <td>{r.sessionName ?? r.programName ?? r.evaluationId}</td>
                      <td>{startsAt ? toColomboDisplay(startsAt) : '—'}</td>
                      <td>{r.scores?.[filters.criterion] ?? '—'} / 100</td>
                      <td>{(r.normalized ?? (r.total != null ? r.total / 10 : null)) ?? '—'} / 100</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {emptyNoEvals && null}
          </>
        )}
      </section>

      <section className={styles.section} aria-label="Your Insights">
        <h2>Your Insights</h2>
        <p className={styles.scope}>Deterministic progress notes for this scope. Human guidance lives in <Link className={styles.link} to="/app/recommendations">Recommendations</Link>.</p>
        {loading && <p role="status">Loading…</p>}
        {!loading && !error && <InsightMessage items={insights} scopeLabel={scopeLabel} evidenceWindow={evidenceWindow} />}
      </section>
    </main>
  );
}
