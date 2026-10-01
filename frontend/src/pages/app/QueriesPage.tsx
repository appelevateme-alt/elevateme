import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { QueryExchange } from '../../components/QueryExchange';
import { StatusBadge } from '../../components/StatusBadge';
import { listQueries } from '../../features/queries/api';
import { filterQueryThreads, paginateQueries, isDiInitiated, threadBody, threadReply } from '../../features/queries/helpers';
import { QUERY_PAGE_SIZE, type QueryThread } from '../../features/queries/types';
import styles from './QueriesPage.module.css';

/** /app/queries — list 10/page, search + status filter, flat exchange rows. */
export function QueriesPage() {
  const [items, setItems] = useState<QueryThread[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await listQueries(1, '', 'all');
        setItems(res.items);
      } catch {
        setError('Failed to load queries.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => filterQueryThreads(items, q, status), [items, q, status]);
  const { pageItems, totalPages } = useMemo(() => paginateQueries(filtered, page, QUERY_PAGE_SIZE), [filtered, page]);

  useEffect(() => { setPage(1); }, [q, status]);

  return (
    <main className={styles.page} data-testid="page-app-queries">
      <PageHeading title="Queries" desc="Message-and-reply records with Diplomatic Impact. Not chat." />
      <p><Link to="/app/queries/new">New query</Link></p>
      <div className={styles.filters} role="group" aria-label="Query filters">
        <label className={styles.field}>Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or details" aria-label="Search queries" />
        </label>
        <label className={styles.field}>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="all">All</option>
            <option value="In review">In review</option>
            <option value="Replied">Replied</option>
            <option value="Closed">Closed</option>
            <option value="Open">Open</option>
          </select>
        </label>
      </div>
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="No queries" body="Your queries and DI replies will appear here." action={<Link to="/app/queries/new">Ask a query</Link>} />
      )}
      <ul className={styles.list}>
        {pageItems.map((t) => (
          <li key={t.id} className={styles.thread} data-testid="query-thread">
            <h2><Link to={`/app/queries/${encodeURIComponent(t.id)}`}>{t.title}</Link> <StatusBadge value={String(t.status)} /></h2>
            <QueryExchange
              queryBody={threadBody(t)}
              queryWhen={String(t.createdAt ?? t.created_at ?? '')}
              replyBody={threadReply(t)}
              initiatedByDi={isDiInitiated(t)}
              comments={[]}
            />
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <div className={styles.pager}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <span className={styles.meta}>Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      )}
    </main>
  );
}
