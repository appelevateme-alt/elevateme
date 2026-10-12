import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseList } from '../../lib/useSupabase.js';
import { TEN_CRITERIA, total1000 } from '../../lib/scores.js';
import { ChartSummary, InsightList, LineChart } from '../../components/domain.jsx';
import { performanceReports, performanceInsights } from './performance.js';

const NONE = '00000000-0000-0000-0000-000000000000';

// Criteria shown as columns in "Per session results".
const TABLE_CRITERIA = ['clarity', 'confidence', 'focus', 'critical-analysis']
  .map((key) => TEN_CRITERIA.find((c) => c.key === key));

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const round1 = (n) => Math.round(n * 10) / 10;
const signed = (n) => `${n > 0 ? '+' : ''}${round1(n)}`;

function gradeFor(score) {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 50) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

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

  /* ----- student-only extras ----- */
  // Personal best: highest complete overall score across every loaded report.
  const completeAll = all.filter(r => r.scaled !== null);
  const best = completeAll.reduce((b, r) => (b === null || r.scaled > b.scaled ? r : b), null);

  // What changed: first vs latest complete report in view, three biggest criterion moves.
  const completeVisible = visible.filter(r => r.scaled !== null);
  const first = completeVisible[0];
  const last = completeVisible.at(-1);
  const changes = completeVisible.length >= 2
    ? TEN_CRITERIA.map(c => ({ ...c, from: first.values[c.key], to: last.values[c.key], delta: last.values[c.key] - first.values[c.key] }))
        .filter(c => Number.isFinite(c.delta) && c.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3)
    : [];

  // Per session rows. Change = this session's score minus the average of all earlier sessions.
  let runningSum = 0;
  let runningCount = 0;
  const sessionRows = visible.map((r) => {
    const change = r.scaled !== null && runningCount > 0 ? r.scaled - runningSum / runningCount : null;
    if (r.scaled !== null) { runningSum += r.scaled; runningCount += 1; }
    return {
      id: r.id,
      name: r.program_title || 'Program',
      date: r.released_at,
      points: r.scaled !== null ? total1000(TEN_CRITERIA.map(c => r.values[c.key])).total : null,
      values: r.values,
      change,
    };
  }).reverse();

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
      <div className="perf-side">
        {studentLinks && (
          <section className="best-card" aria-label="Personal best">
            <span className="best-label">Personal best</span>
            {best ? <>
              <b className="best-grade">{gradeFor(best.scaled)}</b>
              <span className="best-score">{best.scaled} / 100</span>
              <small>{best.program_title || 'Program'} · {fmtDate(best.released_at)}</small>
            </> : <>
              <b className="best-grade">—</b>
              <small>Your best grade appears once a full report is released.</small>
            </>}
          </section>
        )}
        <section className="panel"><div className="panel-head"><h2>Your Insights</h2></div><div className="panel-body"><InsightList items={insights} />
          {studentLinks && latest && <Link to={`/student/performance/${latest.id}`}>Open latest released evaluation</Link>}
        </div></section>
      </div>
    </div>

    {studentLinks && <>
      <section className="panel changed-panel">
        <div className="panel-head"><h2>What changed</h2>{first && last && first.id !== last.id && <span className="changed-range">{fmtDate(first.released_at)} → {fmtDate(last.released_at)}</span>}</div>
        <div className="panel-body">
          {changes.length === 0 ? (
            <p className="changed-empty">{completeVisible.length < 2 ? 'Two complete released reports are needed to show what changed.' : 'No criteria have changed between your first and latest reports.'}</p>
          ) : (
            <div className="changed-grid">
              {changes.map((c) => (
                <div className={`changed-card ${c.delta > 0 ? 'up' : 'down'}`} key={c.key}>
                  <span className="changed-label">{c.label}</span>
                  <b className="changed-delta">{c.delta > 0 ? '▲' : '▼'} {signed(c.delta)}</b>
                  <small>{c.from} → {c.to} / 100</small>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel session-panel">
        <div className="panel-head"><h2>Per session results</h2></div>
        {sessionRows.length === 0 ? (
          <div className="panel-body"><p className="changed-empty">No released sessions in view.</p></div>
        ) : (
          <div className="table-wrap session-table">
            <table className="data-table">
              <thead><tr>
                <th>Session</th><th>Date</th><th>Event points</th>
                {TABLE_CRITERIA.map(c => <th key={c.key}>{c.label}</th>)}
                <th>Change</th>
              </tr></thead>
              <tbody>
                {sessionRows.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/student/performance/${r.id}`}>{r.name}</Link></td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.points !== null ? `${r.points} / 1000` : '—'}</td>
                    {TABLE_CRITERIA.map(c => <td key={c.key}>{Number.isFinite(r.values[c.key]) ? r.values[c.key] : '—'}</td>)}
                    <td>{r.change === null ? <span className="chg flat">—</span> : <span className={`chg ${r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat'}`}>{r.change > 0 ? '▲' : r.change < 0 ? '▼' : ''} {signed(r.change)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>}
  </>;
}