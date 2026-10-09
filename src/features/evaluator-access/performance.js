import { TEN_CRITERIA, total1000 } from '../../lib/scores.js';

export function performanceReports(evaluations, scores) {
  return evaluations.filter(e => e.released).map(e => {
    const values = Object.fromEntries(scores.filter(s => s.evaluation_id === e.id)
      .map(s => [s.criterion_key, s.score == null ? NaN : Number(s.score)]));
    const complete = TEN_CRITERIA.every(c => Number.isFinite(values[c.key]) && values[c.key] >= 0 && values[c.key] <= 100);
    return { ...e, values, scaled: complete ? total1000(TEN_CRITERIA.map(c => values[c.key])).scaled : null };
  }).sort((a, b) => Date.parse(a.released_at) - Date.parse(b.released_at) || a.id.localeCompare(b.id));
}

export function performanceInsights(reports) {
  const complete = reports.filter(r => r.scaled !== null);
  if (!complete.length) return [{ label: 'No data', text: 'Insights appear after a complete report is released.' }];
  const last = complete.at(-1), previous = complete.at(-2);
  const ranked = [...TEN_CRITERIA].sort((a, b) => last.values[b.key] - last.values[a.key]);
  const items = [
    { label: 'Strongest', text: `${ranked[0].label}: ${last.values[ranked[0].key]} / 100 in the latest report.` },
    { label: 'Next focus', text: `${ranked.at(-1).label}: ${last.values[ranked.at(-1).key]} / 100 in the latest report.` },
    { label: 'Best in view', text: `${Math.max(...complete.map(r => r.scaled))} / 100 across the displayed reports.` },
  ];
  if (previous) {
    const change = Math.round((last.scaled - previous.scaled) * 10) / 10;
    items.unshift({ label: change > 0 ? 'Improving' : change < 0 ? 'Declined' : 'Unchanged',
      text: `Overall score ${previous.scaled} → ${last.scaled} since the previous report.` });
    const declined = TEN_CRITERIA.filter(c => last.values[c.key] < previous.values[c.key]);
    if (declined.length) items.push({ label: 'Recent declines', text: declined.map(c => c.label).join(', ') + '.' });
  }
  const low = TEN_CRITERIA.filter(c => last.values[c.key] < 30);
  if (low.length) items.push({ label: 'Needs attention', text: `${low.map(c => c.label).join(', ')} scored below 30 in the latest report.` });
  return items;
}
