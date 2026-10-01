import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import {
  decideProgram,
  listStaffPrograms,
  programDecisionKey,
  publishProgram,
} from '../../features/programs/api';
import type { Program } from '../../features/programs/types';
import styles from './AdminPhase5.module.css';

/**
 * /admin/programs — program review queue (real, replaces the outbox placeholder).
 * Lists PENDING_REVIEW / CHANGES_REQUESTED / APPROVED programs with Approve /
 * Request changes / Reject + note, plus Publish for APPROVED rows. Uses the existing
 * POST /programs/{id}/approve + /publish endpoints (admin-only, audited
 * server-side). A note is required for Request changes / Reject.
 */
export function AdminProgramsPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Program[]>([]);
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
      const res = await listStaffPrograms({ q: q || undefined, page: 1 });
      const queue = res.items.filter((p) =>
        ['PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'].includes(p.lifecycle),
      );
      setItems(queue);
    } catch (e) {
      const kind = toErrorStateFrom(e);
      if (kind === 'denied' || kind === 'pending') setDenied(true);
      else setError(e instanceof ApiError ? e.message : 'Could not load the review queue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const updated = await decideProgram(id, decision, note || undefined, programDecisionKey(id, decision));
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, lifecycle: (updated.lifecycle as Program['lifecycle']) ?? decision } : p)));
      setNotice(
        decision === 'APPROVED'
          ? 'Program approved. It can now be published.'
          : decision === 'CHANGES_REQUESTED'
            ? 'Changes requested — the teacher has been notified.'
            : 'Program rejected.',
      );
      void load();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Decision failed — try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      await publishProgram(id, programDecisionKey(id, 'PUBLISH'));
      setNotice('Program published.');
      void load();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Publish failed — try again.');
    } finally {
      setBusyId(null);
    }
  }

  if (denied) {
    return (
      <main className={styles.page} data-testid="forbidden">
        <PageHeading title="Permission denied" />
        <EmptyState title="Permission denied" body="Administrator access is required for program review." />
      </main>
    );
  }

  return (
    <main className={styles.page} data-testid="page-admin-programs">
      <PageHeading title="Program review" desc="Approve programs, request changes, or publish approved programs." />
      <form onSubmit={(e) => { e.preventDefault(); void load(); }} role="search" className={styles.form}>
        <label className={styles.field}>Search by title
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Program title" aria-label="Search programs" />
        </label>
        <div className={styles.actions}>
          <button type="submit">Search</button>
          <button type="button" onClick={() => { setQ(''); void load(); }}>Clear</button>
        </div>
      </form>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {loading && <p role="status">Loading review queue…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="Review queue is clear" body="Programs waiting for review will appear here." />
      )}
      {items.length > 0 && (
        <div className={styles.tableWrap} role="region" aria-label="Program review" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Program</th>
              <th scope="col">Status</th>
              <th scope="col">Decision + note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} data-testid="admin-program-row">
                <td>
                  <strong>{p.title}</strong>
                  <br />
                  <span className={styles.meta}>{p.theme} · {p.location}</span>
                  <br />
                  <Link to={`/staff/programs/${encodeURIComponent(p.id)}`}>Open workspace</Link>
                </td>
                <td><StatusBadge value={p.lifecycle} /></td>
                <td>
                  <label className={styles.field}>Note (required for changes / reject)
                    <textarea
                      value={notes[p.id] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      rows={2}
                      aria-label={`Decision note for ${p.title}`}
                    />
                  </label>
                  <div className={styles.actions}>
                    <button type="button" disabled={busyId === p.id} onClick={() => void handleDecide(p.id, 'APPROVED')}>
                      {busyId === p.id ? 'Working…' : 'Approve'}
                    </button>
                    <button type="button" disabled={busyId === p.id} onClick={() => void handleDecide(p.id, 'CHANGES_REQUESTED')}>
                      Request changes
                    </button>
                    <button type="button" disabled={busyId === p.id} onClick={() => void handleDecide(p.id, 'REJECTED')}>
                      Reject
                    </button>
                    {p.lifecycle === 'APPROVED' && (
                      <button type="button" disabled={busyId === p.id} onClick={() => void handlePublish(p.id)}>
                        Publish
                      </button>
                    )}
                  </div>
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
