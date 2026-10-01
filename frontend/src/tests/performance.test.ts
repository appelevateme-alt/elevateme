import { describe, expect, it } from 'vitest';
import {
  buildPerformanceParams,
  chartYDomain,
  parsePerformanceSearch,
  performanceSearchFrom,
  personalBestOfRows,
  scopeLabelForPeriod,
  sortInsightsBySpecOrder,
  toCriterionChartData,
  toOverallChartData,
  type PerformanceRow,
} from '../lib/performance';

function row(id: string, startsAt: string, scores: Record<string, number>, normalized?: number): PerformanceRow {
  return {
    evaluationId: id,
    sessionId: `s-${id}`,
    sessionName: `Session ${id}`,
    programName: 'Program A',
    startsAt,
    scores,
    total: normalized != null ? normalized * 10 : Object.values(scores).reduce((a, b) => a + b, 0),
    normalized: normalized ?? Object.values(scores).reduce((a, b) => a + b, 0) / 10,
  };
}

describe('performance Phase 4 — filter param builder', () => {
  it('builds criterion/period/program/session params', () => {
    const qs = buildPerformanceParams({
      criterion: 'clarity',
      period: 'last4w',
      programId: 'p1',
      subtype: 'MUN',
      sessionId: 's1',
      mode: 'bar',
    });
    expect(qs).toContain('criterion=clarity');
    expect(qs).toContain('period=last4w');
    expect(qs).toContain('program=p1');
    expect(qs).toContain('subtype=MUN');
    expect(qs).toContain('session=s1');
  });

  it('custom period sends from/to (inclusive Colombo, backend half-open UTC)', () => {
    const qs = buildPerformanceParams({
      criterion: 'sound',
      period: 'custom',
      customStart: '2026-01-01',
      customEnd: '2026-01-31',
      mode: 'line',
    });
    expect(qs).toContain('period=custom');
    expect(qs).toContain('from=2026-01-01');
    expect(qs).toContain('to=2026-01-31');
    expect(qs).toContain('criterion=sound');
  });

  it('all time sends no period filter; mode is display-only', () => {
    const qs = buildPerformanceParams({
      criterion: 'clarity',
      period: 'all',
      mode: 'bar',
    });
    expect(qs).not.toContain('period=');
    expect(qs).not.toContain('mode=');
  });
});

describe('performance Phase 4 — URL persistence', () => {
  it('round-trips filters through the query string', () => {
    const original = {
      criterion: 'sound',
      period: '3m' as const,
      programId: 'p9',
      subtype: '',
      sessionId: 's2',
      mode: 'line' as const,
    };
    const search = performanceSearchFrom(original);
    const parsed = parsePerformanceSearch(search);
    expect(parsed.criterion).toBe('sound');
    expect(parsed.period).toBe('3m');
    expect(parsed.programId).toBe('p9');
    expect(parsed.sessionId).toBe('s2');
    expect(parsed.mode).toBe('line');
  });

  it('defaults to Clarity / all time / all sessions / bar', () => {
    const parsed = parsePerformanceSearch('');
    expect(parsed.criterion).toBe('clarity');
    expect(parsed.period).toBe('all');
    expect(parsed.sessionId).toBe('');
    expect(parsed.mode).toBe('bar');
  });
});

describe('performance Phase 4 — chart data mapping', () => {
  it('chronological order, no averaging, same-day separate', () => {
    const rows = [
      row('e3', '2026-03-10T10:00:00Z', { clarity: 76 }, 76),
      row('e1', '2026-01-10T10:00:00Z', { clarity: 60 }, 60),
      row('e2', '2026-02-10T10:00:00Z', { clarity: 83 }, 83),
    ];
    const data = toCriterionChartData(rows, 'clarity');
    expect(data.map((d) => d.value)).toEqual([60, 83, 76]);
    // No averaging: 3 rows -> 3 points.
    expect(data).toHaveLength(3);
  });

  it('same-day sessions stay separate points', () => {
    const rows = [
      row('a', '2026-02-10T10:00:00Z', { clarity: 70 }, 70),
      row('b', '2026-02-10T10:00:00Z', { clarity: 80 }, 80),
    ];
    const data = toCriterionChartData(rows, 'clarity');
    expect(data).toHaveLength(2);
    expect(data.map((d) => d.value).sort()).toEqual([70, 80]);
    // Labels disambiguated so X does not collapse same-day.
    expect(new Set(data.map((d) => d.label)).size).toBe(2);
  });

  it('Y domain is always 0-100; tooltips carry event+date+score', () => {
    expect(chartYDomain()).toEqual([0, 100]);
    const data = toCriterionChartData([row('e1', '2026-01-10T10:00:00Z', { clarity: 60 }, 60)], 'clarity');
    expect(data[0].event).toBeTruthy();
    expect(data[0].date).toBeTruthy();
    expect(data[0].score).toBe(60);
  });

  it('overall chart uses normalized; personal best is max', () => {
    const rows = [
      row('e1', '2026-01-10T10:00:00Z', { clarity: 60 }, 60),
      row('e2', '2026-02-10T10:00:00Z', { clarity: 83 }, 83),
      row('e3', '2026-03-10T10:00:00Z', { clarity: 76 }, 76),
    ];
    expect(toOverallChartData(rows).map((d) => d.value)).toEqual([60, 83, 76]);
    expect(personalBestOfRows(rows)).toBe(83);
    expect(scopeLabelForPeriod('last4w')).toBe('last 4 weeks');
    expect(scopeLabelForPeriod('all')).toBe('all time');
  });
});

describe('performance Phase 4 — insights order', () => {
  it('orders low, decline, best, improved, strengths', () => {
    const items = [
      { type: 'strengths' },
      { type: 'improved' },
      { type: 'best' },
      { type: 'decline' },
      { type: 'low' },
    ];
    expect(sortInsightsBySpecOrder(items).map((i) => i.type)).toEqual([
      'low',
      'decline',
      'best',
      'improved',
      'strengths',
    ]);
  });
});
