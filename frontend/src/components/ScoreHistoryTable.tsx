import { toColomboDisplay } from '../lib/time';
import styles from './ScoreHistoryTable.module.css';

export interface ScoreHistoryRow {
  session?: string;
  sessionName?: string;
  total?: number | null;
  normalized?: number | null;
  date?: string;
  startsAt?: string | null;
  starts_at?: string | null;
}

function displayDate(r: ScoreHistoryRow): string {
  const raw = r.date ?? r.startsAt ?? r.starts_at ?? '';
  if (!raw) return '—';
  try {
    return toColomboDisplay(String(raw));
  } catch {
    return String(raw);
  }
}

function displayTotal(r: ScoreHistoryRow): string {
  if (typeof r.total === 'number' && Number.isFinite(r.total)) return `${r.total} / 1000`;
  return '—';
}

function displayNormalized(r: ScoreHistoryRow): string {
  if (typeof r.normalized === 'number' && Number.isFinite(r.normalized)) {
    const rounded = Math.round(r.normalized * 10) / 10;
    return `${rounded} / 100`;
  }
  if (typeof r.total === 'number' && Number.isFinite(r.total)) {
    const rounded = Math.round((r.total / 10) * 10) / 10;
    return `${rounded} / 100`;
  }
  return '—';
}

export function ScoreHistoryTable({ rows }: { rows: Array<ScoreHistoryRow & { session: string; total: number; date: string }> | ScoreHistoryRow[] }) {
  return (
    <div className={styles.wrap} data-testid="score-history-table" role="region" aria-label="Score history" tabIndex={0}>
      <table>
        <caption className={styles.sr}>Score history</caption>
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Date (Colombo)</th>
            <th scope="col">Total</th>
            <th scope="col">Normalized</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.session ?? r.sessionName ?? '—'}</td>
              <td>{displayDate(r)}</td>
              <td>{displayTotal(r)}</td>
              <td>{displayNormalized(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
