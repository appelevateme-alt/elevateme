import { describe, expect, it } from 'vitest';
import { CRITERIA_10, CRITERIA_LABELS, summarize, total1000, validateScore, validateScores } from '../lib/scoring';
// Canonical golden fixtures (single source of truth — see elevateme/tests/fixtures/scoring.json).
// Legacy dupes frontend/tests/fixtures/scoring.json + frontend/src/tests/fixtures/scoring.json removed.
import canonicalFixture from '../../../tests/fixtures/scoring.json';

function scoresObj(vals: number[]): Record<string, number> {
  const o: Record<string, number> = {};
  CRITERIA_10.forEach((k, i) => { o[k] = vals[i]; });
  return o;
}

describe('scoring §5 exact', () => {
  it('criterion keys frozen in order, Sound not Vocal Delivery', () => {
    expect([...CRITERIA_10]).toEqual([
      'preparation','clarity','confidence','focus','critical_analysis',
      'sound','audience_addressing','counter_arguments','wit','overall_performance',
    ]);
    // Canonical fixture is source of truth for key order.
    expect([...CRITERIA_10]).toEqual(canonicalFixture.criteriaOrder);
    expect(CRITERIA_LABELS.sound).toBe('Sound');
  });

  it('tenx100 => 1000/100, tenx0 => 0/100', () => {
    expect(total1000(scoresObj([100,100,100,100,100,100,100,100,100,100]))).toEqual({ total: 1000, normalized: 100 });
    expect(total1000(scoresObj([0,0,0,0,0,0,0,0,0,0]))).toEqual({ total: 0, normalized: 0 });
  });

  it('600/830/760 totals => history 60,83,76 best 83 gain 23', () => {
    const s = summarize([60, 83, 76]);
    expect(s).toEqual({ baseline: 60, best: 83, gain: 23, baselineLabel: 'Baseline 60' });
  });

  it('rejects 101, negative, fractional, missing on submit', () => {
    expect(validateScore(101)).toBe(false);
    expect(validateScore(-1)).toBe(false);
    expect(validateScore(29.5)).toBe(false);
    expect(validateScores({ ...scoresObj([50,50,50,50,50,50,50,50,50,50]), sound: undefined as unknown as number }).ok).toBe(false);
    expect(validateScores(scoresObj([60,60,60,60,60,60,60,60,60,60])).ok).toBe(true);
  });

  it('blank != zero: missing never coerced', () => {
    const r = validateScores({ preparation: 50 } as Record<string, unknown>);
    expect(r.ok).toBe(false);
  });
});
