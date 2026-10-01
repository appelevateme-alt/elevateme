import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicHeader } from '../components/PublicHeader';
import { PageHeading } from '../components/PageHeading';
import { FilterBar } from '../components/FilterBar';
import { EventRow } from '../components/EventRow';
import { EmptyState } from '../components/EmptyState';
import { ApiError, toErrorStateFrom } from '../lib/api';
import { listPublicPrograms } from '../features/programs/api';
import { isPublicStandard } from '../features/programs/helpers';
import { PROGRAM_SUBTYPES, PROGRAM_THEMES, PROGRAM_TYPES, PROGRAM_PAGE_SIZE } from '../features/programs/types';
import type { Program } from '../features/programs/types';
import styles from './ProgramsPage.module.css';

/**
 * Public discover (Phase 1E): anonymous list, no Authorization header
 * (lib/api omits when signed out — incognito works). Only PUBLISHED+PUBLIC
 * standard programs; targeted development never listed. Search (title/desc)
 * + filters theme/type/subtype + pagination 10 stable (load-more).
 */
export function ProgramsPage() {
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('');
  const [type, setType] = useState('');
  const [subtype, setSubtype] = useState('');
  const [items, setItems] = useState<Program[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'forbidden' | 'not-found' | null>(null);

  async function load(reset: boolean, nextPage: number) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    setErrorKind(null);
    try {
      const res = await listPublicPrograms({
        q: q || undefined,
        theme: theme || undefined,
        type: type || undefined,
        subtype: subtype || undefined,
        page: nextPage,
      });
      // Defense in depth: never render targeted/development rows even if API mis-filters.
      const visible = res.items.filter(isPublicStandard);
      setItems((prev) => (reset ? visible : [...prev, ...visible]));
      setHasMore(res.hasMore);
      setPage(nextPage);
    } catch (e) {
      const state = toErrorStateFrom(e);
      if (state === 'denied' || state === 'pending') {
        setErrorKind('forbidden');
        setError(e instanceof ApiError ? e.message : 'Permission denied.');
      } else if (state === 'notfound') {
        setErrorKind('not-found');
        setError(e instanceof ApiError ? e.message : 'Not found.');
      } else {
        setError(e instanceof ApiError ? e.message : 'Failed to load programs.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load(true, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function search(e: React.FormEvent) {
    e.preventDefault();
    void load(true, 1);
  }

  function onFilterChange(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      // Apply immediately so filters work without an extra Search submit.
      // Uses the latest other filter values via closure; page resets to 1.
      void listPublicPrograms({
        q: q || undefined,
        theme: (setter === setTheme ? v : theme) || undefined,
        type: (setter === setType ? v : type) || undefined,
        subtype: (setter === setSubtype ? v : subtype) || undefined,
        page: 1,
      })
        .then((res) => {
          setItems(res.items.filter(isPublicStandard));
          setHasMore(res.hasMore);
          setPage(1);
          setError(null);
          setErrorKind(null);
        })
        .catch((err: unknown) => {
          const state = toErrorStateFrom(err);
          if (state === 'denied' || state === 'pending') {
            setErrorKind('forbidden');
            setError(err instanceof ApiError ? err.message : 'Permission denied.');
          } else {
            setError(err instanceof ApiError ? err.message : 'Failed to load programs.');
          }
        });
    };
  }

  return (
    <>
      <PublicHeader />
      <main className={styles.page}>
        <PageHeading title="Programs" desc="Open standard programs. Targeted development programs are never listed here." />
        <form onSubmit={search} className={styles.search} role="search">
          <label>Search
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or description…" />
          </label>
          <button type="submit">Search</button>
        </form>
        <FilterBar
          selects={[
            {
              label: 'Theme',
              value: theme,
              options: [
                { value: '', label: 'All themes' },
                ...PROGRAM_THEMES.map((t) => ({ value: t, label: t })),
              ],
              onChange: onFilterChange(setTheme),
            },
            {
              label: 'Type',
              value: type,
              options: [
                { value: '', label: 'All types' },
                ...PROGRAM_TYPES.map((t) => ({ value: t, label: t })),
              ],
              onChange: onFilterChange(setType),
            },
            {
              label: 'Subtype',
              value: subtype,
              options: [
                { value: '', label: 'All subtypes' },
                ...PROGRAM_SUBTYPES.map((t) => ({ value: t, label: t })),
              ],
              onChange: onFilterChange(setSubtype),
            },
          ]}
          onReset={() => { setTheme(''); setType(''); setSubtype(''); setQ(''); void load(true, 1); }}
        />
        {loading && <p role="status">Loading programs…</p>}
        {error && errorKind === 'forbidden' && <p role="alert" data-testid="forbidden" className={styles.error}>{error}</p>}
        {error && errorKind === 'not-found' && <p role="alert" data-testid="not-found" className={styles.error}>{error}</p>}
        {error && !errorKind && <p role="alert" className={styles.error}>{error}</p>}
        {!loading && !error && items.length === 0 && (
          <EmptyState title="No programs found" body="Try a different search or filter." />
        )}
        <div className={styles.list}>
          {items.map((p) => (
            <EventRow
              key={p.id}
              date={p.startsAt}
              kind={`${p.type || p.kind} · ${p.subtype ? `${p.subtype} · ` : ''}${p.theme}`}
              title={p.title}
              meta={`${(p.description || '').slice(0, 140)} — ${p.organizer} — ${Math.max(0, p.capacity - p.registeredCount)} seats left`}
              status={p.lifecycle}
              to={`/programs/${encodeURIComponent(p.id)}`}
            />
          ))}
        </div>
        {hasMore && (
          <button type="button" disabled={loadingMore} onClick={() => void load(false, page + 1)} className={styles.more}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
        <p className={styles.hint}><Link to={`/sign-in?next=${encodeURIComponent('/programs')}`}>Sign in</Link> to register. Your destination is preserved after sign-in.</p>
        <span data-testid="page-size" hidden>{PROGRAM_PAGE_SIZE}</span>
      </main>
    </>
  );
}
