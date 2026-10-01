import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError } from '../../lib/api';
import { listReports, type ReportListItem } from '../../features/reports/api';
import { toColomboDisplay } from '../../lib/time';
import styles from './ReportsPage.module.css';

/** /app/reports — released reports only. */
export function ReportsPage() {
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setItems(await listReports());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Failed to load reports.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className={styles.page} data-testid="page-app-reports">
      <PageHeading title="Reports" desc="Released results only." />
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="No reports yet" body="Your first released report will appear here." />
      )}
      <ul className={styles.list}>
        {items.map((r) => {
          const startsAt = r.startsAt ?? r.starts_at ?? r.releasedAt ?? '';
          const total = r.total ?? null;
          const normalized = r.normalized ?? (total != null ? total / 10 : null);
          return (
            <li key={r.id} className={styles.card} data-testid="report-card">
              <h2><Link to={`/app/reports/${encodeURIComponent(r.id)}`}>{r.sessionName || r.programName || 'Report'}</Link></h2>
              <p className={styles.meta}>
                {[r.programName, r.sessionName].filter(Boolean).join(' · ') || 'Event'}
              </p>
              <p className={styles.meta}>
                {startsAt ? toColomboDisplay(String(startsAt)) : 'Undated'}
                {r.evaluatorName ? ` · Evaluator: ${r.evaluatorName}` : ''}
              </p>
              <p className={styles.meta}>
                {total != null ? `Total ${total} / 1000` : ''}{total != null && normalized != null ? ' · ' : ''}
                {normalized != null ? `Normalized ${normalized} / 100` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
