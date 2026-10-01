import { describe, expect, it } from 'vitest';
import { CRITERIA_10, total1000, validateScore, validateScores } from '../lib/scoring';
import {
  isStaleAutosaveResult,
  normalizedOf,
  preserveDraftForNext,
  provisionalTotalOf,
  resolveNextNavigation,
  scoresToOrderedArray,
  shouldApplyAutosaveResult,
} from '../features/evaluation-sheet/helpers';
import {
  buildExchangeFragment,
  cleanedGuestUrl,
  extractFragmentToken,
  isExpiredOrRevoked,
} from '../features/guest-invite/types';

function fullScores(v: number): Record<string, unknown> {
  return Object.fromEntries(CRITERIA_10.map((k) => [k, v]));
}

describe('evaluation Phase 3 — 10-required validation', () => {
  it('requires all 10 criteria (missing fails, blank != zero)', () => {
    expect(validateScores(fullScores(60)).ok).toBe(true);
    expect(validateScores({ preparation: 50 } as Record<string, unknown>).ok).toBe(false);
    expect(validateScores({}).ok).toBe(false);
  });

  it('101 / -1 / fractional / missing all fail', () => {
    expect(validateScore(101)).toBe(false);
    expect(validateScore(-1)).toBe(false);
    expect(validateScore(29.5)).toBe(false);
    expect(validateScore(null)).toBe(false);
    expect(validateScore(undefined)).toBe(false);
    const missing = { ...fullScores(50), sound: undefined as unknown as number };
    expect(validateScores(missing).ok).toBe(false);
    const frac = { ...fullScores(50), wit: 50.5 };
    expect(validateScores(frac).ok).toBe(false);
    const over = { ...fullScores(50), clarity: 101 };
    expect(validateScores(over).ok).toBe(false);
    const neg = { ...fullScores(50), focus: -1 };
    expect(validateScores(neg).ok).toBe(false);
  });

  it('total/10 math: 10x50 => 500/50, 10x100 => 1000/100', () => {
    const fifty = Object.fromEntries(CRITERIA_10.map((k) => [k, 50])) as Record<string, number>;
    expect(total1000(fifty)).toEqual({ total: 500, normalized: 50 });
    const hundred = Object.fromEntries(CRITERIA_10.map((k) => [k, 100])) as Record<string, number>;
    expect(total1000(hundred)).toEqual({ total: 1000, normalized: 100 });
    const nullable = Object.fromEntries(CRITERIA_10.map((k) => [k, 50])) as Record<string, number | null>;
    expect(provisionalTotalOf(nullable)).toBe(500);
    expect(normalizedOf(nullable)).toBe(50);
  });

  it('scores map to ordered 10-slot array with null blanks (never 0-coerced)', () => {
    const scores = { ...Object.fromEntries(CRITERIA_10.map((k) => [k, null])), preparation: 80 } as Record<string, number | null>;
    const arr = scoresToOrderedArray(scores);
    expect(arr).toHaveLength(10);
    expect(arr[0]).toBe(80);
    expect(arr.slice(1).every((v) => v === null)).toBe(true);
  });
});

describe('evaluation Phase 3 — autosave stale-ignore', () => {
  it('ignores stale responses, applies latest', () => {
    expect(shouldApplyAutosaveResult(3, 2)).toBe(false);
    expect(shouldApplyAutosaveResult(3, 3)).toBe(true);
    expect(shouldApplyAutosaveResult(3, 4)).toBe(true);
    expect(isStaleAutosaveResult(3, 2)).toBe(true);
    expect(isStaleAutosaveResult(3, 3)).toBe(false);
  });
});

describe('evaluation Phase 3 — Next preserves draft, never discards', () => {
  it('stay while dirty/saving/error, proceed only when clean', () => {
    expect(resolveNextNavigation({ dirty: true, saving: false, saveError: false })).toBe('stay');
    expect(resolveNextNavigation({ dirty: false, saving: true, saveError: false })).toBe('stay');
    expect(resolveNextNavigation({ dirty: false, saving: false, saveError: true })).toBe('stay');
    expect(resolveNextNavigation({ dirty: false, saving: false, saveError: false })).toBe('proceed');
  });

  it('preserveDraftForNext carries scores+notes keyed by evaluation id', () => {
    const scores = Object.fromEntries(CRITERIA_10.map((k) => [k, 70])) as Record<string, number | null>;
    const out = preserveDraftForNext({}, 'eval-1', scores, 'good');
    expect(out['eval-1'].notes).toBe('good');
    expect(out['eval-1'].scores.preparation).toBe(70);
    const out2 = preserveDraftForNext(out, 'eval-2', scores, 'other');
    expect(out2['eval-1'].notes).toBe('good');
    expect(out2['eval-2'].notes).toBe('other');
  });
});

describe('evaluation Phase 3 — guest fragment handling', () => {
  it('extracts #t= token and builds exchange fragment', () => {
    expect(extractFragmentToken('#t=abc123')).toBe('abc123');
    expect(extractFragmentToken('#t=abc%20123&x=1')).toBe('abc 123');
    expect(extractFragmentToken('#nope')).toBeNull();
    expect(buildExchangeFragment('#t=abc123')).toBe('#t=abc123');
    expect(buildExchangeFragment('')).toBeNull();
  });

  it('cleanup strips hash without leaking token', () => {
    const cleaned = cleanedGuestUrl('https://app.example/evaluate/invite?sessionId=s1#t=secret');
    expect(cleaned).not.toContain('secret');
    expect(cleaned).not.toContain('#t=');
    expect(cleaned).toContain('/evaluate/invite');
  });

  it('expired/revoked maps to request-new-link', () => {
    expect(isExpiredOrRevoked(401)).toBe(true);
    expect(isExpiredOrRevoked(410)).toBe(true);
    expect(isExpiredOrRevoked(403, 'INVITE_REVOKED')).toBe(true);
    expect(isExpiredOrRevoked(403, 'INVITE_EXPIRED')).toBe(true);
    expect(isExpiredOrRevoked(403, 'FORBIDDEN')).toBe(false);
    expect(isExpiredOrRevoked(200)).toBe(false);
  });
});
