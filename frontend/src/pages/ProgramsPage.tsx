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
import type { Program } from '../features/programs/types';
import styles from './ProgramsPage.module.css';

const PAGE_SIZE = 20;

/** Public discover: published standard programs only (never targeted development). Load-more, no infinite scroll. */
export function ProgramsPage() {
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('');
  const [subtype, setSubtype] = useState('');
  const [location, setLocation] = useState('');
  const [availability, setAvailability] = useState('');
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
        subtype: subtype || undefined,
        location: location || undefined,
        availability: availability || undefined,
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
        setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Permission denied.');
      } else if (state === 'notfound') {
        setErrorKind('not-found');
        setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Not found.');
      } else {
        setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load programs.');
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

  return (
    <>
      <PublicHeader />
      <main className={styles.page}>
        <PageHeading title="Programs" desc="Open standard programs. Targeted development programs are never listed here." />
        <form onSubmit={search} className={styles.search} role="search">
          <label>Search
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, organizer…" />
          </label>
          <label>Location
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City or venue" />
          </label>
          <button type="submit">Search</button>
        </form>
        <FilterBar
          selects={[
            { label: 'Theme', value: theme, options: [{ value: '', label: 'All themes' }, { value: 'MUN', label: 'MUN' }, { value: 'Debate', label: 'Debate' }, { value: 'Leadership', label: 'Leadership' }], onChange: setTheme },
            { label: 'Type', value: subtype, options: [{ value: '', label: 'All types' }, { value: 'MUN', label: 'MUN' }, { value: 'DEBATE', label: 'Debate' }, { value: 'CONTINUOUS', label: 'Continuous' }], onChange: setSubtype },
            { label: 'Availability', value: availability, options: [{ value: '', label: 'Any' }, { value: 'open', label: 'Seats open' }, { value: 'waitlist', label: 'Waitlist ok' }], onChange: setAvailability },
          ]}
          onReset={() => { setTheme(''); setSubtype(''); setAvailability(''); setQ(''); setLocation(''); void load(true, 1); }}
        />
        {loading && <p role="status">Loading programs…</p>}
        {error && errorKind === 'forbidden' && <p role="alert" data-testid="forbidden" className={styles.error}>{error}</p>}
        {error && errorKind === 'not-found' && <p role="alert" data-testid="not-found" className={styles.error}>{error}</p>}
        {error && !errorKind && <p role="alert" className={styles.error}>{error}</p>}
        {!loading && !error && items.length === 0 && (
          <EmptyState title="No programs found" body="Try a different search or filter." />
        )}
        <div className={styles.list}>
          {items.slice(0, page * PAGE_SIZE).map((p) => (
            <EventRow
              key={p.id}
              date={p.startsAt}
              kind={`${p.kind} · ${p.theme}`}
              title={p.title}
              meta={`${p.description.slice(0, 140)} — ${p.organizer} — ${Math.max(0, p.capacity - p.registeredCount)} seats left`}
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
        <p className={styles.hint}><Link to="/sign-in">Sign in</Link> to register. Your destination is preserved after sign-in.</p>
      </main>
    </>
  );
}
