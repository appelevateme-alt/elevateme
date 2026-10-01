import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { RecommendationItem } from '../../components/RecommendationItem';
import { ApiError } from '../../lib/api';
import { getMe } from '../../features/home/api';
import { listRecommendations, completeRecommendation, undoRecommendation } from '../../features/recommendations/api';
import { sortRecommendations, filterRecommendations, canComplete, canUndo, sharedAttributionNote, criterionOf } from '../../features/recommendations/helpers';
import type { Recommendation } from '../../features/recommendations/types';
import styles from './RecommendationsPage.module.css';

/** /app/recommendations — flat DI records with Active/Completed + criterion filters. */
export function RecommendationsPage() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<'student' | 'parent'>('student');
  const [status, setStatus] = useState<'Active' | 'Completed'>('Active');
  const [criterion, setCriterion] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('em:view-preference');
      if (v === 'parent') setView('parent');
    } catch { /* noop */ }
    (async () => {
      try {
        const [me, recs] = await Promise.all([getMe().catch(() => null), listRecommendations()]);
        if (me) setUserId(me.id);
        setItems(recs);
      } catch (e) {
        setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load recommendations.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const criteria = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of items) {
      const c = criterionOf(r);
      if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
    }
    return [...seen.values()].sort();
  }, [items]);

  const visible = useMemo(
    () => sortRecommendations(filterRecommendations(items, { status, criterion })),
    [items, status, criterion],
  );

  async function handleComplete(id: string) {
    setBusyId(id);
    try {
      const updated = await completeRecommendation(id);
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated, status: 'Completed' } : r)));
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Could not mark complete.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleUndo(id: string) {
    setBusyId(id);
    try {
      const updated = await undoRecommendation(id);
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated, status: 'Active' } : r)));
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Could not undo.');
    } finally {
      setBusyId(null);
    }
  }

  const note = sharedAttributionNote(view);

  return (
    <main className={styles.page} data-testid="page-app-recommendations">
      <PageHeading title="Recommendations" desc="Development actions from Diplomatic Impact." />
      {note && <p className={styles.note}>{note}</p>}
      <div className={styles.filters} role="group" aria-label="Recommendation filters">
        <label className={styles.field}>Status
          <select value={status} onChange={(e) => setStatus(e.target.value as 'Active' | 'Completed')} aria-label="Status filter">
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
          </select>
        </label>
        <label className={styles.field}>Criterion
          <select value={criterion} onChange={(e) => setCriterion(e.target.value)} aria-label="Criterion filter">
            <option value="all">All criteria</option>
            {criteria.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <EmptyState title={status === 'Active' ? 'No active recommendations' : 'No completed recommendations'} body="New guidance from DI will appear here." />
      )}
      <ul className={styles.list}>
        {visible.map((r) => (
          <li key={r.id}>
            <RecommendationItem
              date={String(r.createdAt ?? r.created_at ?? '')}
              status={String(r.status)}
              title={r.title}
              author={r.author ?? r.authorName}
              action={r.action}
              reason={r.reason}
              criterion={criterionOf(r) || undefined}
              reportId={r.reportId}
              priority={r.priority}
              dueDate={r.dueDate ?? r.due_date ?? undefined}
              canComplete={canComplete(r, userId, view)}
              canUndo={canUndo(r, userId, view)}
              completing={busyId === r.id}
              onComplete={() => handleComplete(r.id)}
              onUndo={() => handleUndo(r.id)}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
