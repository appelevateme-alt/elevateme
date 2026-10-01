import { useEffect, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api';
import { listAdminQueries, adminReplyQuery, adminSetQueryStatus } from '../../features/queries/api';
import type { QueryThread } from '../../features/queries/types';
import styles from './AdminPhase5.module.css';

/** /admin/queries — reply / close / reopen queue. */
export function AdminQueriesPage() {
  const [items, setItems] = useState<QueryThread[]>([]);
  const [status, setStatus] = useState('all');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(s: string) {
    setLoading(true);
    try {
      setItems(await listAdminQueries(s));
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load queue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleReply(id: string) {
    const body = (replies[id] ?? '').trim();
    if (!body) {
      setNotice('Reply text is required.');
      return;
    }
    setBusyId(id);
    try {
      await adminReplyQuery(id, body);
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'Replied', reply: body } : t)));
      setReplies((p) => ({ ...p, [id]: '' }));
      setNotice('Reply sent.');
    } catch (e) {
      setNotice(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Reply failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatus(id: string, action: 'close' | 'reopen') {
    setBusyId(id);
    try {
      await adminSetQueryStatus(id, action);
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status: action === 'close' ? 'Closed' : 'Open' } : t)));
      setNotice(action === 'close' ? 'Query closed.' : 'Query reopened.');
    } catch (e) {
      setNotice(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Status update failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={styles.page} data-testid="page-admin-queries">
      <PageHeading title="Queries" desc="Reply, close, or reopen query threads." />
      <label className={styles.field}>Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="all">All</option>
          <option value="Open">Open</option>
          <option value="In review">In review</option>
          <option value="Replied">Replied</option>
          <option value="Closed">Closed</option>
        </select>
      </label>
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="Queue empty" body="No queries for this filter." />
      )}
      {items.map((t) => (
        <section key={t.id} className={styles.form} aria-label={t.title}>
          <h2>{t.title} <StatusBadge value={String(t.status)} /></h2>
          <p className={styles.meta}>{String(t.body ?? t.query ?? '')}</p>
          <label className={styles.field}>Reply
            <textarea
              value={replies[t.id] ?? ''}
              onChange={(e) => setReplies((p) => ({ ...p, [t.id]: e.target.value }))}
              rows={2}
              aria-label={`Reply to ${t.title}`}
            />
          </label>
          <div className={styles.actions}>
            <button type="button" disabled={busyId === t.id} onClick={() => handleReply(t.id)}>Reply</button>
            <button type="button" disabled={busyId === t.id} onClick={() => handleStatus(t.id, 'close')}>Close</button>
            <button type="button" disabled={busyId === t.id} onClick={() => handleStatus(t.id, 'reopen')}>Reopen</button>
          </div>
        </section>
      ))}
    </main>
  );
}
