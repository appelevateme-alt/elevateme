import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError } from '../../lib/api';
import { getReport, type ReportDetail } from '../../features/reports/api';
import { toColomboDisplay } from '../../lib/time';
import styles from './ReportsPage.module.css';

/**
 * /app/reports/:id — released only: event/session/evaluator, 10 marks +
 * total/1000 + normalized/100 + typed remarks + correction version.
 * Sound label stays Sound. No staff-private notes, no AI column.
 * Print-friendly CSS (PDF future via window.print).
 */
export function ReportDetailPage() {
  const { id } = useParams();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setReport(await getReport(decodeURIComponent(id)));
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load report.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <main className={styles.page} data-testid="page-app-report-detail">
        <PageHeading title="Report" />
        <p role="status">Loading…</p>
      </main>
    );
  }
  if (notFound) {
    return (
      <main className={styles.page} data-testid="page-app-report-detail">
        <PageHeading title="Report" />
        <div data-testid="not-found"><EmptyState title="Not found" body="Report not found." /></div>
      </main>
    );
  }
  if (error || !report) {
    return (
      <main className={styles.page} data-testid="page-app-report-detail">
        <PageHeading title="Report" />
        <p role="alert" className={styles.error}>{error ?? 'Failed to load report.'}</p>
        <p><Link to="/app/reports">Back to reports</Link></p>
      </main>
    );
  }

  const startsAt = report.startsAt ?? report.starts_at ?? '';
  const marks = report.marks ?? [];
  const version = report.correctionVersion ?? report.revisionNo ?? 1;

  return (
    <main className={styles.page} data-testid="page-app-report-detail">
      <PageHeading
        title={report.sessionName || report.programName || 'Report'}
        desc={[report.programName, report.sessionName].filter(Boolean).join(' · ') || 'Released report'}
      />
      <div className={styles.detail}>
        <p className={styles.meta}>
          {startsAt ? toColomboDisplay(String(startsAt)) : 'Undated'}
          {report.evaluatorName ? ` · Evaluator: ${report.evaluatorName}` : ''}
          {report.releasedAt ? ` · Released ${toColomboDisplay(String(report.releasedAt))}` : ''}
        </p>
        <table className={styles.marks}>
          <caption>Criterion marks (Sound, not Vocal Delivery)</caption>
          <thead><tr><th scope="col">Criterion</th><th scope="col">Score</th></tr></thead>
          <tbody>
            {marks.map((m) => (
              <tr key={m.criterionKey}>
                <th scope="row">{m.label}</th>
                <td>{m.score ?? '—'} / 100</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.totals}>
          <span className={styles.total}>Total: {report.total} / 1000</span>
          <span className={styles.total}>Normalized: {report.normalized} / 100</span>
          <span className={styles.total}>Correction version: v{version}{report.corrected ? ' (corrected)' : ''}</span>
        </div>
        {(report.correctionReason || report.remarks) && (
          <div className={styles.remarks}>
            <h2>Remarks</h2>
            {report.remarks ? <p>{report.remarks}</p> : null}
            {report.correctionReason ? <p className={styles.meta}>Correction note: {report.correctionReason}</p> : null}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
          <Link to="/app/reports">Back to reports</Link>
        </div>
      </div>
    </main>
  );
}
