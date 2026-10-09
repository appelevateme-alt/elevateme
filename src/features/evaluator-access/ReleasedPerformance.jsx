import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseList } from '../../lib/useSupabase.js';
import { TEN_CRITERIA } from '../../lib/scores.js';
import { ChartSummary, InsightList, LineChart } from '../../components/domain.jsx';
import { performanceReports, performanceInsights } from './performance.js';

const NONE = '00000000-0000-0000-0000-000000000000';

export function ReleasedPerformance({ studentId, studentLinks = false }) {
  const [criterion, setCriterion] = useState('overall-score');
  const [days, setDays] = useState('all');
  const [sessionId, setSessionId] = useState('all');
  const [chartType, setChartType] = useState('line');
  const [now] = useState(() => Date.now());
  const reports = useSupabaseList({ table: 'published_evaluations',
    filters: { student_id: studentId || NONE, released: true },
    order: { col: 'released_at', ascending: false }, pageSize: 20 });
  const ids = reports.data.map(r => r.id);
  const scores = useSupabaseList({ table: 'published_evaluation_scores',
    filters: { evaluation_id: ids.length ? ids : [NONE] }, pageSize: 200 });
  const all = performanceReports(reports.data, scores.data);
  const visible = all.filter(r => (sessionId === 'all' || r.session_id === sessionId)
    && (days === 'all' || Date.parse(r.released_at) >= now - Number(days) * 86400000));
  const latest = visible.filter(r => r.scaled !== null).at(-1);
  const points = visible.map(r => ({ id: r.id, label: r.program_title || 'Program',
    value: criterion === 'overall-score' ? r.scaled : r.values[criterion] }))
    .filter(p => Number.isFinite(p.value));
  const insights = performanceInsights(visible);
  if (reports.loading || scores.loading) return <p role="status">Loading released performance…</p>;
  if (reports.error || scores.error) return <p role="alert">Could not load performance. {reports.error?.message || scores.error?.message}</p>;
  return <>
    <p>Showing up to the 20 most recently released reports, oldest to newest. Time filters use release date.</p>
    <div className="filter-bar">
      <label>Criterion<select value={criterion} onChange={e => setCriterion(e.target.value)}><option value="overall-score">Overall score</option>{TEN_CRITERIA.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
      <label>Period<select value={days} onChange={e => setDays(e.target.value)}><option value="all">All loaded reports</option><option value="28">Last 4 weeks</option><option value="90">Last 3 months</option><option value="180">Last 6 months</option></select></label>
      <label>Session<select value={sessionId} onChange={e => setSessionId(e.target.value)}><option value="all">All sessions</option>{[...new Map(all.filter(r => r.session_id).map(r => [r.session_id, r])).values()].map((r, i) => <option key={r.session_id} value={r.session_id}>{r.program_title || 'Program'} — session {i + 1}</option>)}</select></label>
      <label>Chart<select value={chartType} onChange={e => setChartType(e.target.value)}><option value="line">Line</option><option value="bar">Bar</option></select></label>
    </div>
    <div className="grid dashboard">
      <section className="chart-panel"><ChartSummary label="Latest overall score in view" value={latest ? `${latest.scaled} / 100` : 'No complete reports'} />
        <LineChart points={points} type={chartType} />
        {points.length > 0 && <ol>{points.map(p => <li key={p.id}>{p.label}: {p.value} / 100</li>)}</ol>}
      </section>
      <section className="panel"><div className="panel-head"><h2>Your Insights</h2></div><div className="panel-body"><InsightList items={insights} />
        {studentLinks && latest && <Link to={`/student/performance/${latest.id}`}>Open latest released evaluation</Link>}
      </div></section>
    </div>
  </>;
}
