import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { FilterBar } from '../../components/FilterBar';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { listStaffPrograms } from '../../features/programs/api';
import { nextActionForLifecycle } from '../../features/programs/helpers';
import type { Program, ProgramLifecycle } from '../../features/programs/types';
import styles from '../admin/AdminPhase5.module.css';

const PAGE_SIZE = 10;
const LIFECYCLES: ProgramLifecycle[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PUBLISHED',
  'COMPLETED',
  'ARCHIVED',
];

/**
 * /staff/programs — real list (not a placeholder): own programs + assigned,
 * lifecycle status + next action + workspace link. Search + status filter +
 * pagination. Server scopes rows; client never filters by owner.
 */
export function StaffProgramsPage() {
  const [q, setQ] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [items, setItems] = useState<Program[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  async function load(nextPage: number, reset: boolean) {
    if (reset) setLoading(true);
    setError(null);
    try {
      // Backend ProgramsService.list supports q/theme/type/subtype/page only —
      // no lifecycle param yet (TODO: add ?status= to ProgramsController list).
      // When a status filter is active, fetch every page then filter so the
      // count and paging stay honest; otherwise keep single-page server paging.
      // status is sent for forward-compat (server ignores it for now).
      if (lifecycle) {
        const all: Program[] = [];
        let p = 1;
        for (;;) {
          const res = await listStaffPrograms({ q: q || undefined, page: p, status: lifecycle });
          all.push(...res.items);
          if (!res.hasMore) break;
          p += 1;
          if (p > 50) break;
        }
        const filtered = all.filter((item) => item.lifecycle === lifecycle);
        setItems(reset ? filtered : [...items, ...filtered]);
        setTotal(filtered.length);
        setPage(1);
        setHasMore(false);
      } else {
        const res = await listStaffPrograms({ q: q || undefined, page: nextPage });
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(nextPage);
        setHasMore(res.hasMore);
      }
    } catch (e) {
      const kind = toErrorStateFrom(e);
      if (kind === 'denied' || kind === 'pending') setDenied(true);
      else {
        if (e instanceof ApiError) console.warn('Load programs failed', e.code);
        setError(e instanceof ApiError ? e.message : 'Could not load programs.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => items, [items]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    void load(1, true);
  }

  if (denied) {
    return (
      <main className={styles.page} data-testid="forbidden">
        <PageHeading title="Permission denied" />
        <EmptyState title="Permission denied" body="Staff access is required for programs." />
      </main>
    );
  }

  return (
    <main className={styles.page} data-testid="page-staff-programs">
      <PageHeading title="Programs" desc="Your programs and assigned sessions. Pick one to continue its work." />
      <p>
        <Link to="/staff/programs/new">New program</Link>
        {' · '}
        <Link to="/staff/comment-bank">Comment bank</Link>
      </p>
      <form onSubmit={search} role="search" className={styles.form}>
        <label className={styles.field}>Search by title
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Program title" aria-label="Search programs" />
        </label>
        <div className={styles.actions}>
          <button type="submit">Search</button>
        </div>
      </form>
      <FilterBar
        selects={[
          {
            label: 'Status',
            value: lifecycle,
            options: [{ value: '', label: 'All statuses' }, ...LIFECYCLES.map((l) => ({ value: l, label: l }))],
            onChange: (v) => {
              setLifecycle(v);
            },
          },
        ]}
        onReset={() => {
          setQ('');
          setLifecycle('');
          void load(1, true);
        }}
      />
      <div className={styles.actions}>
        <button type="button" onClick={() => void load(1, true)}>Apply status filter</button>
      </div>
      {loading && <p role="status">Loading programs…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => void load(1, true)}>Retry</button>
        </p>
      )}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title="No programs yet"
          body="Programs you own or are assigned to will appear here."
          action={<Link to="/staff/programs/new">Start a new program</Link>}
        />
      )}
      {visible.length > 0 && (
        <>
          <p className={styles.meta} role="status">
            Showing {visible.length} of {total}
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Program</th>
                <th scope="col">Status</th>
                <th scope="col">Next step</th>
                <th scope="col">Open</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const next = nextActionForLifecycle(p.lifecycle);
                return (
                  <tr key={p.id} data-testid="staff-program-row">
                    <td>
                      <strong>{p.title}</strong>
                      <br />
                      <span className={styles.meta}>
                        {p.theme} · {p.location}
                      </span>
                    </td>
                    <td>
                      <StatusBadge value={p.lifecycle} />
                    </td>
                    <td>{next.label}</td>
                    <td>
                      <Link to={`/staff/programs/${encodeURIComponent(p.id)}`}>Open workspace</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore && (
            <div className={styles.actions}>
              <button type="button" onClick={() => void load(page + 1, false)}>
                Load more (page {page + 1})
              </button>
            </div>
          )}
          <span hidden data-testid="page-size">{PAGE_SIZE}</span>
        </>
      )}
    </main>
  );
}
