import { describe, expect, it } from 'vitest';
import { sortRecommendations, topPinned, filterRecommendations } from '../features/recommendations/helpers';
import type { Recommendation } from '../features/recommendations/types';
import { validateQueryInput, buildQueryListParams, paginateQueries, isDiInitiated } from '../features/queries/helpers';
import { QUERY_LIMITS } from '../features/queries/types';
import { pendingAgeHours, pendingAgeLabel, reservationExpiry, isReservationExpired, holdRemainingLabel, isFree, priceLabel, HOLD_HOURS } from '../features/development/helpers';

function rec(partial: Partial<Recommendation> & { id: string }): Recommendation {
  return {
    title: 't', action: 'a', reason: 'r', priority: 'MEDIUM', status: 'Active',
    ...partial,
  } as Recommendation;
}

describe('phase5 — recommendation sort HIGH -> due date (undated last) -> newest', () => {
  it('HIGH sorts before MEDIUM/LOW regardless of dates', () => {
    const items = [
      rec({ id: 'low', priority: 'LOW', dueDate: '2026-01-01T00:00:00Z', createdAt: '2026-03-01T00:00:00Z' }),
      rec({ id: 'high', priority: 'HIGH', dueDate: '2026-12-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }),
      rec({ id: 'med', priority: 'MEDIUM', createdAt: '2026-02-01T00:00:00Z' }),
    ];
    expect(sortRecommendations(items).map((r) => r.id)).toEqual(['high', 'med', 'low']);
  });

  it('earliest due date first, undated last, then newest', () => {
    const items = [
      rec({ id: 'undated-new', priority: 'HIGH', createdAt: '2026-05-01T00:00:00Z' }),
      rec({ id: 'late', priority: 'HIGH', dueDate: '2026-06-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }),
      rec({ id: 'early', priority: 'HIGH', dueDate: '2026-02-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }),
      rec({ id: 'undated-old', priority: 'HIGH', createdAt: '2026-01-01T00:00:00Z' }),
    ];
    expect(sortRecommendations(items).map((r) => r.id)).toEqual(['early', 'late', 'undated-new', 'undated-old']);
  });

  it('pin max 3', () => {
    const items = [1, 2, 3, 4, 5].map((n) =>
      rec({ id: `r${n}`, priority: 'HIGH', pinned: true, createdAt: `2026-01-0${n}T00:00:00Z` }),
    );
    expect(topPinned(items).length).toBe(3);
    expect(topPinned(items, 3).length).toBeLessThanOrEqual(3);
  });

  it('filters Active/Completed + criterion', () => {
    const items = [
      rec({ id: 'a', status: 'Active', criterion: 'Clarity' }),
      rec({ id: 'b', status: 'Completed', criterion: 'Clarity' }),
      rec({ id: 'c', status: 'Active', criterion: 'Confidence' }),
    ];
    expect(filterRecommendations(items, { status: 'Active', criterion: 'all' }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterRecommendations(items, { status: 'Completed', criterion: 'all' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRecommendations(items, { status: 'Active', criterion: 'clarity' }).map((r) => r.id)).toEqual(['a']);
  });
});

describe('phase5 — query validation 120/5000', () => {
  it('accepts limits exactly', () => {
    const ok = validateQueryInput({ title: 'x'.repeat(QUERY_LIMITS.titleMax), body: 'y'.repeat(QUERY_LIMITS.bodyMax) });
    expect(ok.ok).toBe(true);
  });

  it('rejects 121-char title and 5001-char body', () => {
    expect(validateQueryInput({ title: 'x'.repeat(121), body: 'ok' }).ok).toBe(false);
    expect(validateQueryInput({ title: 'ok', body: 'y'.repeat(5001) }).ok).toBe(false);
  });

  it('requires non-blank title and body', () => {
    expect(validateQueryInput({ title: '  ', body: 'b' }).ok).toBe(false);
    expect(validateQueryInput({ title: 't', body: '   ' }).ok).toBe(false);
  });

  it('list params carry q/status/page (backend: GET /queries?q,status,page, 10/page server-side)', () => {
    const qs = buildQueryListParams({ page: 2, q: 'mun', status: 'Open' });
    expect(qs).toContain('page=2');
    expect(qs).not.toContain('pageSize');
    expect(qs).toContain('q=mun');
    expect(qs).toContain('status=Open');
    const { pageItems, totalPages } = paginateQueries(Array.from({ length: 25 }, (_, i) => i), 2, 10);
    expect(pageItems.length).toBe(10);
    expect(totalPages).toBe(3);
    expect(isDiInitiated({ initiatedBy: 'di' })).toBe(true);
    expect(isDiInitiated({ initiatedBy: 'student' })).toBe(false);
  });
});

describe('phase5 — payment hold math', () => {
  const created = '2026-01-01T00:00:00Z';

  it('pending age 48h at hold boundary', () => {
    const now = new Date('2026-01-03T00:00:00Z');
    expect(pendingAgeHours(created, now)).toBeCloseTo(48, 5);
    expect(pendingAgeLabel(created, now)).toContain('2d');
  });

  it('reservation expiry defaults to 48h hold', () => {
    const exp = reservationExpiry(created, HOLD_HOURS, null);
    expect(exp?.toISOString()).toBe('2026-01-03T00:00:00.000Z');
    expect(isReservationExpired(created, new Date('2026-01-02T00:00:00Z'))).toBe(false);
    expect(isReservationExpired(created, new Date('2026-01-04T00:00:00Z'))).toBe(true);
  });

  it('explicit held-until overrides computed hold', () => {
    const exp = reservationExpiry(created, HOLD_HOURS, '2026-02-01T00:00:00Z');
    expect(exp?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(holdRemainingLabel(created, new Date('2026-03-01T00:00:00Z'), HOLD_HOURS, '2026-02-01T00:00:00Z'))
      ?.toMatch(/expired/i);
  });

  it('free vs paid labels', () => {
    expect(isFree({ price: 0 })).toBe(true);
    expect(isFree({ price: null, free: true })).toBe(true);
    expect(isFree({ price: 5000 })).toBe(false);
    expect(priceLabel({ price: 0 })).toBe('Free');
    expect(priceLabel({ price: 5000, currency: 'LKR' })).toContain('5,000');
  });
});
