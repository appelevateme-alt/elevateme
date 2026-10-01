import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { getDevelopment } from '../../features/development/api';
import { isFree, priceLabel, externalPaymentLink, heldUntilOf, holdRemainingLabel } from '../../features/development/helpers';
import type { DevelopmentItem } from '../../features/development/types';
import styles from './DevelopmentPage.module.css';

/**
 * /app/development/:id — direct fetch, 404 unless assigned (or admin).
 * Backend truth: GET /me/development/{id} 404s for non-assignees
 * (targeted invisibility, no enumeration).
 */
export function DevelopmentDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState<DevelopmentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setItem(await getDevelopment(decodeURIComponent(id)));
      } catch (e) {
        if (toErrorStateFrom(e) === 'notfound') setNotFound(true);
        else setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load development.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <main className={styles.page} data-testid="page-app-development-detail">
        <PageHeading title="Development" />
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (notFound || (!error && !item)) {
    return (
      <main className={styles.page} data-testid="page-app-development-detail">
        <PageHeading title="Development" />
        <div data-testid="not-found">
          <EmptyState
            title="Not found"
            body="This development is not assigned to you."
            action={<Link to="/app/development">Back to development</Link>}
          />
        </div>
      </main>
    );
  }

  if (error || !item) {
    return (
      <main className={styles.page} data-testid="page-app-development-detail">
        <PageHeading title="Development" />
        <p role="alert" className={styles.error}>{error ?? 'Failed to load.'}</p>
        <p><Link to="/app/development">Back to development</Link></p>
      </main>
    );
  }

  const link = externalPaymentLink(item);
  const heldUntil = heldUntilOf(item);
  const expiry = holdRemainingLabel(item.assignedAt ?? item.assigned_at ?? null, new Date(), 48, heldUntil);

  return (
    <main className={styles.page} data-testid="page-app-development-detail">
      <PageHeading title={item.title ?? item.skill ?? 'Development'} desc={item.reason} />
      <p>
        <StatusBadge value={String(item.status ?? 'Assigned')} /> {priceLabel(item)}
        {isFree(item) ? '' : ' (paid — verification required)'}
      </p>
      <p className={styles.meta}>
        {item.assignedAt ?? item.assigned_at ? `Assigned: ${item.assignedAt ?? item.assigned_at} ` : ''}
        {item.eligibility ? `· Eligibility: ${item.eligibility} ` : ''}
        {item.availability ? `· Availability: ${item.availability}` : ''}
      </p>
      {expiry && <p className={styles.notice}>{expiry}</p>}
      {link && (
        <p className={styles.actions}>
          <a href={link} target="_blank" rel="noopener noreferrer" className={styles.external}>Pay externally</a>
        </p>
      )}
      <p className={styles.actions}>
        <Link to="/app/development">Back to development</Link>
      </p>
    </main>
  );
}
