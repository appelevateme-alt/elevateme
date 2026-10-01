import { useEffect, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { CRITERIA_10, CRITERIA_LABELS } from '../../lib/scoring';
import { createCommentBankEntry, listCommentBank } from '../../features/comment-bank/api';
import type { CommentBankEntry, CommentBankScope } from '../../features/comment-bank/types';
import styles from './CommentBankPage.module.css';

export function CommentBankPage() {
  const { session } = useAuth();
  const isAdmin = session?.roles.includes('admin') ?? false;
  const [items, setItems] = useState<CommentBankEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [scope, setScope] = useState<CommentBankScope>('TEACHER_PRIVATE');
  const [criterionKey, setCriterionKey] = useState('');
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await listCommentBank());
    } catch (e) {
      const kind = toErrorStateFrom(e);
      if (kind === 'denied' || kind === 'pending') setDenied(true);
      else setError(e instanceof ApiError ? e.message : 'Failed to load comment bank.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setNotice('Text is required (1–2000 chars).');
      return;
    }
    setCreating(true);
    try {
      const created = await createCommentBankEntry({
        scope,
        criterionKey: criterionKey || null,
        text: trimmed,
      });
      setItems((prev) => [created, ...prev]);
      setText('');
      setNotice('Snippet saved (human-authored, no AI).');
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Create failed.');
    } finally {
      setCreating(false);
    }
  }

  if (denied) {
    return <main className={styles.page} data-testid="forbidden"><PageHeading title="Permission denied" /><EmptyState title="Permission denied" body="Staff access required for the comment bank." /></main>;
  }

  const filtered = items.filter((it) => {
    if (!filter.trim()) return true;
    return it.text.toLowerCase().includes(filter.trim().toLowerCase());
  });
  const shared = filtered.filter((it) => String(it.scope).toUpperCase() === 'ADMIN_SHARED');
  const priv = filtered.filter((it) => String(it.scope).toUpperCase() !== 'ADMIN_SHARED');

  return (
    <main className={styles.page} data-testid="comment-bank">
      <PageHeading title="Comment bank" desc="Human-authored snippets only — no AI. Shared (admin) + your private snippets." />
      <form onSubmit={(e) => e.preventDefault()} className={styles.search} role="search">
        <label>Search snippets
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search text" />
        </label>
      </form>
      {loading && <p role="status">Loading snippets…</p>}
      {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {!loading && !error && (
        <>
          <section aria-label="Shared snippets">
            <h2>Shared ({shared.length})</h2>
            {shared.length === 0 ? <p className={styles.meta}>No shared snippets yet.</p> : (
              <ul className={styles.list}>
                {shared.map((it) => (
                  <li key={it.id} data-testid="bank-row">{it.text}{it.criterionKey ? ` — ${CRITERIA_LABELS[it.criterionKey as (typeof CRITERIA_10)[number]] ?? it.criterionKey}` : ''}</li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Private snippets">
            <h2>Private ({priv.length})</h2>
            {priv.length === 0 ? <p className={styles.meta}>No private snippets yet.</p> : (
              <ul className={styles.list}>
                {priv.map((it) => (
                  <li key={it.id} data-testid="bank-row">{it.text}{it.criterionKey ? ` — ${CRITERIA_LABELS[it.criterionKey as (typeof CRITERIA_10)[number]] ?? it.criterionKey}` : ''}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <section aria-label="New snippet" className={styles.form}>
        <h2>New snippet</h2>
        <form onSubmit={(e) => void handleCreate(e)}>
          <label>Scope
            <select value={scope} onChange={(e) => setScope(e.target.value as CommentBankScope)}>
              <option value="TEACHER_PRIVATE">Private (only you)</option>
              {isAdmin && <option value="ADMIN_SHARED">Shared (admin only)</option>}
            </select>
          </label>
          {!isAdmin && <p className={styles.meta}>Shared snippets curated by admins</p>}
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
          <button type="submit" disabled={creating}>{creating ? 'Saving…' : 'Save snippet'}</button>
        </form>
        {notice && <p role="status" className={styles.meta}>{notice}</p>}
      </section>
    </main>
  );
}
