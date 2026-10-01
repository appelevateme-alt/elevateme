import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { CRITERIA_10, CRITERIA_LABELS } from '../../lib/scoring';
import { createCommentBankEntry, listCommentBank } from '../../features/comment-bank/api';
import { isSharedScope } from '../../features/comment-bank/types';
import type { CommentBankEntry } from '../../features/comment-bank/types';
import styles from '../staff/CommentBankPage.module.css';

/**
 * /admin/comment-bank — shared snippets only (ADMIN_SHARED).
 * Same backend as /staff/comment-bank, but scoped to the shared collection:
 * staff see shared + own private, admins curate the shared set. No redirect
 * to an unrelated page.
 */
export function AdminCommentBankPage() {
  const [items, setItems] = useState<CommentBankEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [criterionKey, setCriterionKey] = useState('');
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const all = await listCommentBank();
      setItems(all.filter((it) => isSharedScope(String(it.scope))));
    } catch (e) {
      const kind = toErrorStateFrom(e);
      if (kind === 'denied' || kind === 'pending') setDenied(true);
      else setError(e instanceof ApiError ? e.message : 'Could not load shared snippets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setNotice('Text is required (1–2000 chars).');
      return;
    }
    setCreating(true);
    setNotice(null);
    try {
      const created = await createCommentBankEntry({
        scope: 'ADMIN_SHARED',
        criterionKey: criterionKey || null,
        text: trimmed,
      });
      setItems((prev) => [created, ...prev]);
      setText('');
      setNotice('Shared snippet saved — visible to all staff.');
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Create failed.');
    } finally {
      setCreating(false);
    }
  }

  if (denied) {
    return (
      <main className={styles.page} data-testid="forbidden">
        <PageHeading title="Permission denied" />
        <EmptyState title="Permission denied" body="Administrator access is required for shared snippets." />
      </main>
    );
  }

  const query = filter.trim().toLowerCase();
  const filtered = query ? items.filter((it) => it.text.toLowerCase().includes(query)) : items;

  return (
    <main className={styles.page} data-testid="page-admin-comment-bank">
      <PageHeading title="Shared snippets" desc="Curate the shared collection every teacher can use. Private teacher snippets stay under staff." />
      <p>
        <Link to="/staff/comment-bank">Open staff comment bank</Link>
      </p>
      <form onSubmit={(e) => e.preventDefault()} className={styles.search} role="search">
        <label>Search shared snippets
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search text" />
        </label>
      </form>
      {loading && <p role="status">Loading snippets…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="No shared snippets" body="Shared snippets you add here appear for all staff." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <ul className={styles.list}>
          {filtered.map((it) => (
            <li key={it.id} data-testid="bank-row">
              {it.text}
              {it.criterionKey ? ` — ${CRITERIA_LABELS[it.criterionKey as (typeof CRITERIA_10)[number]] ?? it.criterionKey}` : ''}
            </li>
          ))}
        </ul>
      )}
      <section aria-label="New shared snippet" className={styles.form}>
        <h2>New shared snippet</h2>
        <form onSubmit={(e) => void handleCreate(e)}>
          <label>Criterion (optional)
            <select value={criterionKey} onChange={(e) => setCriterionKey(e.target.value)}>
              <option value="">General</option>
              {CRITERIA_10.map((k) => (
                <option key={k} value={k}>{CRITERIA_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label>Text (1–2000 chars)
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} aria-label="Snippet text" />
          </label>
          <button type="submit" disabled={creating}>{creating ? 'Saving…' : 'Save shared snippet'}</button>
        </form>
        {notice && <p role="status" className={styles.meta}>{notice}</p>}
      </section>
    </main>
  );
}
