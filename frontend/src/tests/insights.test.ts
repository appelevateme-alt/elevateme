import { describe, expect, it } from 'vitest';
import { insightsFor, type ScopedEvaluation } from '../lib/insights';
import { CRITERIA_10 } from '../lib/scoring';

function ev(id: string, starts_at: string, normalized: number, overrides: Partial<ScopedEvaluation> = {}): ScopedEvaluation {
  const per = normalized; // uniform per-criterion for simplicity unless overridden
  const scores: Record<string, number> = {};
  for (const c of CRITERIA_10) scores[c] = per;
  return { id, starts_at, normalized, scores: { ...scores, ...overrides.scores }, released: overrides.released ?? true };
}

describe('insights §6 exact', () => {
  it('29 flags low alert, 30 does not', () => {
    const e29 = ev('e1', '2026-01-10T10:00:00Z', 29, { scores: { preparation: 29 } });
    // build full uniform 29 then check low present
    const all29: Record<string, number> = {};
    for (const c of CRITERIA_10) all29[c] = 29;
    const out29 = insightsFor([{ ...e29, scores: all29 }]);
    expect(out29.some((i) => i.kind === 'low')).toBe(true);

    const all30: Record<string, number> = {};
    for (const c of CRITERIA_10) all30[c] = 30;
    const out30 = insightsFor([{ ...e29, scores: all30, normalized: 30 }]);
    expect(out30.some((i) => i.kind === 'low')).toBe(false);
  });

  it('60 -> 83 -> 76 creates recent decline of 7', () => {
    const out = insightsFor([
      ev('e1', '2026-01-10T10:00:00Z', 60),
      ev('e2', '2026-02-10T10:00:00Z', 83),
      ev('e3', '2026-03-10T10:00:00Z', 76),
    ]);
    const decline = out.find((i) => i.kind === 'decline');
    expect(decline).toBeDefined();
    expect(decline!.text).toContain('7');
  });

  it('tie is matched, not new best', () => {
    const out = insightsFor([
      ev('e1', '2026-01-10T10:00:00Z', 70),
      ev('e2', '2026-02-10T10:00:00Z', 70),
    ]);
    expect(out.some((i) => i.text.includes('Matched personal best'))).toBe(true);
  });

  it('new personal best when exceeding previous', () => {
    const out = insightsFor([
      ev('e1', '2026-01-10T10:00:00Z', 60),
      ev('e2', '2026-02-10T10:00:00Z', 83),
    ]);
    expect(out.some((i) => i.kind === 'best' && i.text.includes('New personal best: 83'))).toBe(true);
  });

  it('zero history shows starter message, no fabricated trend', () => {
    const out = insightsFor([]);
    expect(out[0].text).toContain('first report');
  });

  it('unreleased never affects feed', () => {
    const out = insightsFor([
      ev('e1', '2026-01-10T10:00:00Z', 60),
      { ...ev('eDraft', '2026-04-10T10:00:00Z', 100), released: false },
    ]);
    expect(out.some((i) => i.text.includes('New personal best: 100'))).toBe(false);
    expect(out.some((i) => i.text.includes('60/100'))).toBe(true);
  });
});
