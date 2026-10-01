import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { QueryExchange } from '../../components/QueryExchange';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api';
import { getQuery, addQueryComment, setQueryStatus } from '../../features/queries/api';
import { isDiInitiated, threadBody, threadReply, queryIdempotencyKey } from '../../features/queries/helpers';
import type { QueryThread } from '../../features/queries/types';
import styles from './QueriesPage.module.css';

interface CommentRow { id: string; body: string; when: string; }

/** /app/queries/:id — exchange + full-width comments + close/reopen. */
export function QueryDetailPage() {
  const { id } = useParams();
  const [thread, setThread] = useState<QueryThread | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const t = await getQuery(decodeURIComponent(id));
        if (!t) {
          setError('Not found.');
        } else {
          setThread(t);
          // Backend truth: GET /queries/{id} returns the thread + chronological
          // messages. There is no GET .../comments route — hydrate comments
          // from the thread payload when present.
          const embedded = (t as { messages?: CommentRow[]; comments?: CommentRow[] }).messages
            ?? (t as { comments?: CommentRow[] }).comments
            ?? [];
          setComments(Array.isArray(embedded) ? embedded : []);
        }
      } catch (e) {
        setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load query.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleStatus(action: 'close' | 'reopen') {
    if (!thread) return;
    setBusy(true);
    setNotice(null);
    try {
      await setQueryStatus(thread.id, action);
      setThread({ ...thread, status: action === 'close' ? 'Closed' : 'Open' });
    } catch (e) {
      setNotice(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Could not update status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!thread || !comment.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      await addQueryComment(thread.id, comment.trim(), queryIdempotencyKey());
      setComments((prev) => [...prev, { id: `local-${Date.now()}`, body: comment.trim(), when: new Date().toISOString() }]);
      setComment('');
      setNotice('Comment added.');
    } catch (err) {
      setNotice(err instanceof ApiError ? `${err.message} (code ${err.code})` : 'Could not add comment. Your text is preserved.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page} data-testid="page-app-query-detail">
        <PageHeading title="Query" />
        <p role="status">Loading…</p>
      </main>
    );
  }
  if (error || !thread) {
    return (
      <main className={styles.page} data-testid="page-app-query-detail">
        <PageHeading title="Query" />
        <div data-testid="not-found"><EmptyState title="Not found" body={error ?? 'Query not found.'} action={<Link to="/app/queries">Back to queries</Link>} /></div>
      </main>
    );
  }

  const closed = String(thread.status).toLowerCase() === 'closed';

  return (
    <main className={styles.page} data-testid="page-app-query-detail">
      <PageHeading title={thread.title} desc={`Status: ${thread.status}`} />
      <p><StatusBadge value={String(thread.status)} /> <Link to="/app/queries">Back to queries</Link></p>
      <QueryExchange
        queryBody={threadBody(thread)}
        queryWhen={String(thread.createdAt ?? thread.created_at ?? '')}
        replyBody={threadReply(thread)}
        initiatedByDi={isDiInitiated(thread)}
        comments={comments}
      />
      {notice && <p role="status" className={styles.meta}>{notice}</p>}
      <form className={styles.form} onSubmit={handleComment}>
        <label className={styles.field}>Further comment
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} aria-label="Further comment" />
        </label>
        <div className={styles.actions}>
          <button type="submit" disabled={busy || !comment.trim()}>Add comment</button>
          {closed
            ? <button type="button" disabled={busy} onClick={() => handleStatus('reopen')}>Reopen</button>
            : <button type="button" disabled={busy} onClick={() => handleStatus('close')}>Close</button>}
        </div>
      </form>
    </main>
  );
}
