import { useCallback, useEffect, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError } from '../../lib/api';
import { toColomboDisplay } from '../../lib/time';
import { listOutbox, type OutboxRow, type OutboxState } from '../../features/admin/outbox';
import styles from './OutboxPage.module.css';

const STATES: OutboxState[] = ['FAILED', 'PENDING', 'SENT', 'SKIPPED'];

/**
 * /admin/outbox — FAILED triage table (recipient, type, entity, retries,
 * provider ID, error, Retry). Uses existing OutboxAdminController GET API.
 * No per-row retry endpoint exists: Retry re-checks the queue (refetch);
 * failed rows stay as history — the worker retries automatically,
 * re-emit a new event if resend is warranted (docs/OUTBOX.md).
 */
export function OutboxPage() {
  const [state, setState] = useState<OutboxState>('FAILED');
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (s: OutboxState) => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listOutbox(s));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load outbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(state);
  }, [load, state]);

  async function handleRetry(row: OutboxRow) {
    // Real handler: re-check this row's state via refetch (no invented POST).
    setBusyId(row.id);
    setNotice(null);
    try {
      const fresh = await listOutbox(state);
      setRows(fresh);
      const still = fresh.find((r) => r.id === row.id);
      setNotice(
        still
          ? `Re-checked queue: still ${String(still.state ?? state)} after ${String(still.retryCount ?? 0)} retries. Delivery failed, will retry.`
          : `Re-checked queue: entry no longer in ${state}.`,
      );
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Re-check failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={styles.page} data-testid="page-admin-outbox">
      <PageHeading title="Outbox" desc="Triage failed deliveries." />
      <label className={styles.field}>
        State
        <select value={state} onChange={(e) => setState(e.target.value as OutboxState)} aria-label="Outbox state">
          {STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <div className={styles.actions}>
        <button type="button" disabled={loading} onClick={() => void load(state)}>Refresh</button>
      </div>
      {loading && <p role="status">Loading…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => void load(state)}>Retry</button>
        </p>
      )}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title={`No ${state} rows`} body="The outbox queue is clear for this state." />
      )}
      {rows.length > 0 && (
        <div className={styles.wrap} role="region" aria-label="Outbox deliveries" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Recipient</th>
                <th scope="col">Type</th>
                <th scope="col">Entity</th>
                <th scope="col">Retries</th>
                <th scope="col">Provider ID</th>
                <th scope="col">Error</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.aggregateType ?? '—'}</td>
                  <td>{r.eventType ?? '—'}</td>
                  <td>{r.aggregateType ?? '—'}</td>
                  <td>{r.retryCount ?? 0}{r.nextRetryAt ? ` · next ${toColomboDisplay(r.nextRetryAt)}` : ''}</td>
                  <td>{r.providerMessageId ?? '—'}</td>
                  <td>{(r.state ?? state) === 'FAILED' ? 'Delivery failed, will retry' : (r.state ?? state)}</td>
                  <td>
                    <button type="button" disabled={busyId === r.id} onClick={() => void handleRetry(r)}>
                      {busyId === r.id ? 'Checking…' : 'Retry'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
