import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEN_CRITERIA } from '../../src/lib/scores.js';
import { performanceReports, performanceInsights } from '../../src/features/evaluator-access/performance.js';

test('performance orders released reports, preserves zero, and excludes incomplete totals', () => {
  const evaluations = [{ id: 'b', released: true, released_at: '2026-02-01' }, { id: 'a', released: true, released_at: '2026-01-01' }, { id: 'draft', released: false }];
  const scores = TEN_CRITERIA.map(c => ({ evaluation_id: 'a', criterion_key: c.key, score: 0 }));
  const result = performanceReports(evaluations, scores);
  assert.deepEqual(result.map(r => r.id), ['a', 'b']);
  assert.equal(result[0].scaled, 0);
  assert.equal(result[1].scaled, null);
});

test('insights report actual declines and below-30 criteria instead of fabricated improvement', () => {
  const evaluations = ['a','b'].map((id, i) => ({ id, released: true, released_at: `2026-0${i+1}-01` }));
  const scores = evaluations.flatMap((e, i) => TEN_CRITERIA.map(c => ({ evaluation_id: e.id, criterion_key: c.key, score: i ? 20 : 80 })));
  const insights = performanceInsights(performanceReports(evaluations, scores));
  assert.equal(insights[0].label, 'Declined');
  assert.ok(insights.some(i => i.label === 'Needs attention'));
  assert.ok(insights.some(i => i.label === 'Best in view' && i.text.includes('80 / 100')));
  assert.equal(performanceInsights([])[0].label, 'No data');
});
