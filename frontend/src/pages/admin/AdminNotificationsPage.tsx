import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError } from '../../lib/api';
import { toColomboDisplay } from '../../lib/time';
import {
  isUnread,
  listHomeNotifications,
  markRead,
  type HomeNotification,
} from '../../features/home/api';
import { listOutbox } from '../../features/admin/outbox';
import styles from './AdminPhase5.module.css';

function noteDate(n: HomeNotification): string {
  const raw = n.created_at ?? n.createdAt ?? '';
  if (!raw) return '';
  try {
    return toColomboDisplay(String(raw));
  } catch {
    return String(raw);
  }
}

/**
 * /admin/notifications — in-app notice list + outbox triage link.
 * Reuses the same GET /notifications feed as Home and the outbox
 * FAILED queue for delivery triage (no new backend routes).
 */
export function AdminNotificationsPage() {
  const [notes, setNotes] = useState<HomeNotification[]>([]);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [items, failed] = await Promise.all([
          listHomeNotifications(50),
          listOutbox('FAILED').catch(() => []),
        ]);
        if (cancelled) return;
        setNotes(items);
        setFailedCount(failed.length);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load notifications.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleMarkRead(id: string) {
    try {
      await markRead(id);
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n)),
      );
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Could not mark as read.');
    }
  }

  const unread = notes.filter(isUnread);

  return (
    <main className={styles.page} data-testid="page-admin-notifications">
      <PageHeading title="Notifications" desc="In-app notices and delivery triage." />
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      <section aria-label="Delivery triage" className={styles.section}>
        <h2>Delivery triage</h2>
        <p className={styles.meta}>
          {failedCount == null
            ? 'Delivery failures are triaged in the outbox.'
            : failedCount === 0
              ? 'Outbox is clear — no failed deliveries.'
              : `${failedCount} failed deliver${failedCount === 1 ? 'y' : 'ies'} waiting in the outbox.`}{' '}
          <Link to="/admin/outbox">Open outbox</Link>
        </p>
      </section>
      <section aria-label="In-app notices" className={styles.section}>
        <h2>In-app notices ({unread.length} unread)</h2>
        {loading && <p role="status">Loading…</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {!loading && !error && notes.length === 0 && (
          <EmptyState title="No notices" body="New replies, releases, and assignments will appear here." />
        )}
        {!loading && !error && notes.length > 0 && (
          <ul>
            {notes.map((n) => (
              <li key={n.id}>
                <strong>{n.title ?? n.type ?? 'Notice'}</strong>
                {noteDate(n) && <span className={styles.meta}> · {noteDate(n)}</span>}
                {n.body && <p className={styles.meta}>{n.body}</p>}
                {isUnread(n) && (
                  <button type="button" onClick={() => void handleMarkRead(n.id)}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
