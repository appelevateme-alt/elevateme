import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './PerformanceChart.module.css';

export interface PerfPoint { label: string; value: number; event?: string; date?: string; score?: number }

// Recharts + data table. Bar/Line toggle (same data), Y 0-100 always,
// X chronological sessions, tooltips event+date+score. Points not interpolated.
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: PerfPoint }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = (payload[0]?.payload ?? {}) as PerfPoint;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tipEvent}>{p.event || label}</p>
      {p.date && <p className={styles.tipMeta}>{p.date}</p>}
      <p className={styles.tipScore}>Score: {p.score ?? p.value} / 100</p>
    </div>
  );
}

export function PerformanceChart({
  data,
  mode = 'bar',
  referenceValue = null,
  referenceLabel,
  caption = 'Performance data table',
}: {
  data: PerfPoint[];
  mode?: 'bar' | 'line';
  referenceValue?: number | null;
  referenceLabel?: string;
  caption?: string;
}) {
  return (
    <div data-testid="performance-chart" className={styles.wrap}>
      <div
        className={styles.chart}
        role="img"
        aria-label={`${caption}: ${data.length} session${data.length === 1 ? '' : 's'}, scores 0 to 100. Full data follows in the table.`}
      >
        <ResponsiveContainer width="100%" height={260}>
          {mode === 'bar' ? (
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={false} tickLine={false} aria-hidden />
              <YAxis domain={[0, 100]} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="Score" isAnimationActive={false} />
              {typeof referenceValue === 'number' && (
                <ReferenceLine y={referenceValue} strokeDasharray="6 3" label={referenceLabel ?? 'Personal best'} />
              )}
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={false} tickLine={false} aria-hidden />
              <YAxis domain={[0, 100]} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              {/* connectNulls=false: points are never interpolated across missing sessions. */}
              <Line type="monotone" dataKey="value" name="Score" dot connectNulls={false} isAnimationActive={false} />
              {typeof referenceValue === 'number' && (
                <ReferenceLine y={referenceValue} strokeDasharray="6 3" label={referenceLabel ?? 'Personal best'} />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className={styles.axisNote}>Sessions in chronological order. Y axis 0–100.</p>
      <table className={styles.table}>
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Session</th><th scope="col">Event</th><th scope="col">Date</th><th scope="col">Score</th></tr></thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <td>{d.label}</td>
              <td>{d.event ?? d.label}</td>
              <td>{d.date ?? '—'}</td>
              <td>{d.score ?? d.value} / 100</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
