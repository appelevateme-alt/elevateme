import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EventRow } from '../../components/EventRow';
import { EmptyState } from '../../components/EmptyState';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { listPublicPrograms } from '../../features/programs/api';
import { isPublicStandard } from '../../features/programs/helpers';
import type { Program } from '../../features/programs/types';
import styles from './MyProgramsPage.module.css';

/** /app/programs — discover standard programs; register once from detail. Attendance never inferred. */
export function MyProgramsPage() {
  const [items, setItems] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'forbidden' | 'not-found' | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await listPublicPrograms({});
        setItems(res.items.filter(isPublicStandard));
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
      }
    })();
  }, []);

  return (
    <main className={styles.page} data-testid="app-programs">
      <PageHeading title="Discover programs" desc="Standard programs open for registration." />
      {loading && <p role="status">Loading…</p>}
      {error && errorKind === 'forbidden' && <p role="alert" data-testid="forbidden" className={styles.error}>{error}</p>}
      {error && errorKind === 'not-found' && <p role="alert" data-testid="not-found" className={styles.error}>{error}</p>}
      {error && !errorKind && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="No programs" body="No standard programs are open right now." />
      )}
      {items.map((p) => (
        <EventRow
          key={p.id}
          date={p.startsAt}
          kind={`${p.kind} · ${p.theme}`}
          title={p.title}
          meta={`${p.organizer} — ${Math.max(0, p.capacity - p.registeredCount)} seats left`}
          status={p.lifecycle}
          to={`/programs/${encodeURIComponent(p.id)}`}
        />
      ))}
      <p className={styles.meta}><Link to="/app/registrations">View my registrations</Link> for allocation and status.</p>
    </main>
  );
}
