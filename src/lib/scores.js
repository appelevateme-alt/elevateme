// 1000-point scoring model: ten criteria, each scored 0–100.
// Sheet total = sum (0–1000). Final score = total ÷ 10, out of 100
// (e.g. 800/1000 scales to 80/100). No baseline, no level bands.
export const MAX_PER_CRITERION = 100;
export const CRITERIA_COUNT = 10;
export const MAX_TOTAL = 1000;
export const SCALE_DIVISOR = 10;

export const SCORE_GUIDE =
  'Each criterion is scored out of 100. The sheet total is out of 1000; the final score is the total ÷ 10, out of 100.';

// Coerce to a number within 0–100. Returns null when not a usable score.
export function clampScore(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > MAX_PER_CRITERION) return MAX_PER_CRITERION;
  return Math.round(n * 100) / 100;
}

// Accepts an object ({ criterionKey: score }) or an array ([{ score }] or [score]).
// Returns { total, scaled, count } where scaled = total / 10 (final score out of 100).
export function total1000(scores) {
  const arr = Array.isArray(scores)
    ? scores.map((s) => (s != null && typeof s === 'object' ? s.score ?? s.value ?? null : s))
    : Object.values(scores || {});
  const nums = arr.map((v) => clampScore(v)).filter((v) => v != null);
  const total = nums.reduce((sum, n) => sum + n, 0);
  const scaled = Math.round((total / SCALE_DIVISOR) * 10) / 10;
  return { total: Math.round(total * 100) / 100, scaled, count: nums.length };
}

// Short display: "800 / 1000 → 80 / 100".
export function formatTotal(calc) {
  return `${calc.total} / ${MAX_TOTAL} → ${calc.scaled} / 100`;
}

export const TEN_CRITERIA = [
  { key: 'preparation', label: 'Preparation', help: 'Evidence of research and readiness.' },
  { key: 'clarity', label: 'Clarity', help: 'Ideas expressed in a clear, ordered way.' },
  { key: 'confidence', label: 'Confidence', help: 'Composure and self-assurance when speaking.' },
  { key: 'focus', label: 'Focus', help: 'Stays on motion, topic, and time.' },
  { key: 'critical-analysis', label: 'Critical Analysis', help: 'Depth of reasoning and use of evidence.' },
  { key: 'vocal-delivery', label: 'Vocal Delivery', help: 'Volume, pace and projection across the room.' },
  { key: 'audience', label: 'Audience Addressing', help: 'Engages and addresses the audience or committee.' },
  { key: 'counter', label: 'Counter Arguments', help: 'Responds to opposing points directly.' },
  { key: 'wit', label: 'Wit', help: "Timely, appropriate sharpness — never at others' expense." },
  { key: 'overall', label: 'Overall Performance', help: 'Holistic impression for this session.' },
];
