import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { ApiError } from '../../lib/api';
import { createQuery } from '../../features/queries/api';
import { validateQueryInput, queryIdempotencyKey } from '../../features/queries/helpers';
import { QUERY_LIMITS } from '../../features/queries/types';
import { listPublicPrograms } from '../../features/programs/api';
import { listReports, type ReportListItem } from '../../features/reports/api';
import type { Program } from '../../features/programs/types';
import styles from './QueriesPage.module.css';

/** /app/queries/new — title 120 + body 5000, idempotency key, preserve on error. */
export function QueryNewPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [programId, setProgramId] = useState('');
  const [reportId, setReportId] = useState('');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const keyRef = useRef<string>(queryIdempotencyKey());

  useEffect(() => {
    (async () => {
      try {
        const res = await listPublicPrograms({});
        setPrograms(res.items ?? []);
      } catch {
        /* selects fall back to empty — submit still works unlinked */
      }
      try {
        setReports(await listReports());
      } catch {
        /* same fallback */
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateQueryInput({ title, body });
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      const created = await createQuery({
        title: title.trim(),
        body: body.trim(),
        linkedProgram: programId.trim() || null,
        linkedReport: reportId.trim() || null,
        idempotencyKey: keyRef.current,
      });
      setDone(true);
      // Keep inputs (never clear on failure only; success shows In review then navigates).
      navigate(`/app/queries/${encodeURIComponent(created.id)}`, { replace: false });
    } catch (err) {
      // Preserve inputs on error; mint a fresh key only after a transport failure to allow retry.
      keyRef.current = queryIdempotencyKey();
      setErrors([err instanceof ApiError ? err.message : 'Could not submit. Your text is preserved — try again.']);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page} data-testid="page-app-queries-new">
      <PageHeading title="New query" desc="Ask Diplomatic Impact about a program or report." />
      <p className={styles.hint}>
        Write one clear question per query. Replies appear under Queries — this is not a live chat,
        and there are no typing indicators.
      </p>
      {done && <p role="status">Your query is in review. DI will reply under Queries.</p>}
      {errors.length > 0 && (
        <div role="alert" className={styles.error}>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>Title (max {QUERY_LIMITS.titleMax})
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={QUERY_LIMITS.titleMax + 10} aria-label="Query title" />
          <span className={styles.hint}>{title.length} / {QUERY_LIMITS.titleMax}</span>
        </label>
        <label className={styles.field}>Details (max {QUERY_LIMITS.bodyMax})
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} aria-label="Query details" />
          <span className={styles.hint}>{body.length} / {QUERY_LIMITS.bodyMax}</span>
        </label>
        <label className={styles.field}>Linked program (optional)
          <select value={programId} onChange={(e) => setProgramId(e.target.value)} aria-label="Linked program">
            <option value="">No linked program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.title || 'Untitled program'}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>Linked report (optional)
          <select value={reportId} onChange={(e) => setReportId(e.target.value)} aria-label="Linked report">
            <option value="">No linked report</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>{r.programName || r.sessionName || 'Report'}</option>
            ))}
          </select>
        </label>
        <div className={styles.actions}>
          <button type="submit" disabled={submitting} className={styles.primary}>
            {submitting ? 'Submitting…' : 'Submit query'}
          </button>
          <Link to="/app/queries">Back to queries</Link>
        </div>
        {submitting && <p role="status" className={styles.progress}>Submitting… your text is kept if this fails.</p>}
      </form>
    </main>
  );
}
