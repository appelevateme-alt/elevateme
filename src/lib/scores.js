// 50+ scoring model: every student starts from a baseline of 50 and adds
// points per criterion level. PROVISIONAL mapping — confirm exact add-ons:
//   L (Low) +0 · G (Good) +1 · VG (Very Good) +2 · E (Excellent) +3
// With ten criteria the ceiling is 50 + 30 = 80. Change SCORE_MAP in one
// place once the business mapping is finalized.
export const SCORE_GUIDE = 'Baseline 50 · L Low (+0) · G Good (+1) · VG Very Good (+2) · E Excellent (+3)';
export const LEVELS = ['L', 'G', 'VG', 'E'];
export const LEVEL_HELP = { L: 'Low', G: 'Good', VG: 'Very Good', E: 'Excellent' };
export const SCORE_MAP = { L: 0, G: 1, VG: 2, E: 3 };

export function addedPoints(level) {
  return SCORE_MAP[level] ?? 0;
}

// Accepts an object ({criterionKey: level}) or an array ([{level}] or [level]).
// Returns { added, total } where total = 50 + added.
export function total50(levels) {
  const arr = Array.isArray(levels) ? levels.map((l) => l?.level ?? l) : Object.values(levels || {});
  const added = arr.reduce((sum, l) => sum + (SCORE_MAP[l] ?? 0), 0);
  return { added, total: 50 + added };
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
