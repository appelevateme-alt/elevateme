import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api';
import { decideAccount, listReviewAccounts, type AdminUserRow } from '../../features/admin/users';
import styles from './AdminPhase5.module.css';

/**
 * /admin/users — account review queue (real page, replaces the outbox placeholder).
 *
 * Lists pending teacher accounts with Approve / Request changes / Reject + note.
 * When the backend list endpoint is missing, shows an explicit "waiting on
 * backend" empty state — never fakes success.
 */
export function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [backendMessage, setBackendMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listReviewAccounts('PendingReview');
      setItems(res.items);
      setBackendAvailable(res.backendAvailable);
      setBackendMessage(res.message ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setDenied(true);
      else setError(e instanceof ApiError ? e.message : 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDecide(id: string, decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') {
    const note = (notes[id] ?? '').trim();
    if ((decision === 'CHANGES_REQUESTED' || decision === 'REJECTED') && !note) {
      setNotice('Add a note explaining the changes or reason — it is required for this decision.');
      return;
    }
    setBusyId(id);
    setNotice(null);
    try {
      await decideAccount(id, decision, note || undefined);
      setNotice('Decision recorded.');
      void load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Decision failed — try again.');
    } finally {
      setBusyId(null);
    }
  }

  if (denied) {
    return (
      <main className={styles.page} data-testid="forbidden">
        <PageHeading title="Permission denied" />
        <EmptyState title="Permission denied" body="Administrator access is required for account review." />
      </main>
    );
  }

  const query = q.trim().toLowerCase();
  const visible = query
    ? items.filter((u) =>
        `${u.displayName ?? ''} ${u.email ?? ''} ${u.elevateMeId ?? ''}`.toLowerCase().includes(query),
      )
    : items;

  return (
    <main className={styles.page} data-testid="page-admin-users">
      <PageHeading title="Account review" desc="Review pending teacher accounts. Approvals unlock staff access." />
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {loading && <p role="status">Loading accounts…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </p>
      )}
      {!loading && !error && !backendAvailable && (
        <EmptyState
          title="Account review unavailable"
          body={backendMessage ?? 'The account list is not available yet. Pending accounts stay pending — nothing was approved or rejected here.'}
        />
      )}
      {!loading && !error && backendAvailable && (
        <>
          <form onSubmit={(e) => e.preventDefault()} role="search" className={styles.form}>
            <label className={styles.field}>Search by name or email
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" aria-label="Search accounts" />
            </label>
          </form>
          {visible.length === 0 && (
            <EmptyState title="No pending accounts" body="Teacher applications waiting for review will appear here." />
          )}
          {visible.length > 0 && (
            <div className={styles.tableWrap} role="region" aria-label="Account review" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Status</th>
                  <th scope="col">Decision + note</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} data-testid="admin-user-row">
                    <td>
                      <strong>{u.displayName ?? u.email ?? 'Account'}</strong>
                      <br />
                      <span className={styles.meta}>{u.email ?? 'No email'} · {(u.roles ?? [u.role ?? 'staff']).join(', ')}</span>
                      <br />
                      <Link to={`/admin/users/${encodeURIComponent(u.id)}`}>Open profile</Link>
                    </td>
                    <td><StatusBadge value={String(u.status ?? 'PendingReview')} /></td>
                    <td>
                      <label className={styles.field}>Note (required for changes / reject)
                        <textarea
                          value={notes[u.id] ?? ''}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          rows={2}
                          aria-label={`Decision note for ${u.displayName ?? u.email ?? 'account'}`}
                        />
                      </label>
                      <div className={styles.actions}>
                        <button type="button" disabled={busyId === u.id} onClick={() => void handleDecide(u.id, 'APPROVED')}>
                          {busyId === u.id ? 'Working…' : 'Approve'}
                        </button>
                        <button type="button" disabled={busyId === u.id} onClick={() => void handleDecide(u.id, 'CHANGES_REQUESTED')}>
                          Request changes
                        </button>
                        <button type="button" disabled={busyId === u.id} onClick={() => void handleDecide(u.id, 'REJECTED')}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
