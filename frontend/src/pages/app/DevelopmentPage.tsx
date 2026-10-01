import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api';
import { listDevelopment, registerDevelopment, registerIdempotencyKey, submitPaidReference } from '../../features/development/api';
import { isFree, priceLabel, externalPaymentLink, heldUntilOf, holdRemainingLabel } from '../../features/development/helpers';
import type { DevelopmentItem } from '../../features/development/types';
import styles from './DevelopmentPage.module.css';

/**
 * /app/development — assigned only.
 * POST /me/development/{id}/register (FREE confirms; PAID returns
 * AWAITING_PAYMENT_VERIFICATION), then POST /registrations/{id}/payment-reference
 * ("I have paid" — does NOT confirm; DI verifies first).
 */
export function DevelopmentPage() {
  const [items, setItems] = useState<DevelopmentItem[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [regIds, setRegIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setItems(await listDevelopment());
      } catch (e) {
        setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load development.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleFree(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const out = await registerDevelopment(id, registerIdempotencyKey(id));
      const regId = (out as { registrationId?: string }).registrationId;
      if (regId) setRegIds((p) => ({ ...p, [id]: regId }));
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'Confirmed' } : r)));
      setNotice('Confirmed.');
    } catch (e) {
      setNotice(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Could not confirm.');
    } finally {
      setBusyId(null);
    }
  }

  async function handlePaid(developmentId: string) {
    const ref = (refs[developmentId] ?? '').trim();
    if (!ref) {
      setNotice('Enter the payment reference first.');
      return;
    }
    setBusyId(developmentId);
    setNotice(null);
    try {
      // Resolve the registration id: a fresh PAID register returns it; a repeat
      // register 409s (DUPLICATE) when one already exists — reuse the known id.
      let registrationId: string | null = regIds[developmentId]
        ?? (items.find((d) => d.id === developmentId) as { registrationId?: string | null } | undefined)?.registrationId
        ?? null;
      if (!registrationId) {
        try {
          const out = await registerDevelopment(developmentId, registerIdempotencyKey(developmentId));
          registrationId = (out as { registrationId?: string }).registrationId ?? null;
        } catch (e) {
          if (!(e instanceof ApiError && e.code === 'DUPLICATE')) throw e;
          // Already registered — fall through; the verification row already exists
          // server-side. Without a known registration id we cannot claim.
        }
        if (registrationId) setRegIds((p) => ({ ...p, [developmentId]: registrationId as string }));
      }
      const claimId = registrationId ?? developmentId;
      await submitPaidReference(claimId, ref);
      setItems((prev) => prev.map((r) => (r.id === developmentId ? { ...r, status: 'Awaiting verification', paidReference: ref } : r)));
      setNotice('Reference submitted. Awaiting verification — this does not confirm your seat.');
    } catch (e) {
      setNotice(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Could not submit reference.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={styles.page} data-testid="page-app-development">
      <PageHeading title="Development" desc="Programs assigned to you." />
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="No development assigned" body="Assigned development programs will appear here." />
      )}
      <ul className={styles.list}>
        {items.map((d) => {
          const free = isFree(d);
          const link = externalPaymentLink(d);
          const heldUntil = heldUntilOf(d);
          const expiry = holdRemainingLabel(d.assignedAt ?? d.assigned_at ?? null, new Date(), 48, heldUntil);
          const awaiting = String(d.status ?? '').toLowerCase().includes('await');
          return (
            <li key={d.id} className={styles.card} data-testid="development-item">
              <h2><Link to={`/app/development/${encodeURIComponent(d.id)}`}>{d.title ?? d.skill ?? 'Development'}</Link></h2>
              <p><StatusBadge value={String(d.status ?? 'Assigned')} /> {priceLabel(d)}</p>
              <p>Reason: {d.reason}</p>
              <p className={styles.meta}>
                {d.assignedAt ?? d.assigned_at ? `Assigned: ${d.assignedAt ?? d.assigned_at} ` : ''}
                {d.eligibility ? `· Eligibility: ${d.eligibility} ` : ''}
                {d.availability ? `· Availability: ${d.availability}` : ''}
              </p>
              {expiry && <p className={styles.notice}>{expiry}</p>}
              {free ? (
                <div className={styles.actions}>
                  <button type="button" disabled={busyId === d.id} onClick={() => handleFree(d.id)}>Confirm</button>
                </div>
              ) : (
                <>
                  <p className={styles.notice}>{awaiting ? 'Awaiting verification.' : 'Paid program — complete payment, then submit your reference.'}</p>
                  {link && (
                    <p className={styles.actions}>
                      <a href={link} target="_blank" rel="noopener noreferrer" className={styles.external}>Pay externally</a>
                    </p>
                  )}
                  <form
                    className={styles.form}
                    onSubmit={(e) => { e.preventDefault(); handlePaid(d.id); }}
                  >
                    <label>I have paid — reference
                      <input
                        value={refs[d.id] ?? ''}
                        onChange={(e) => setRefs((p) => ({ ...p, [d.id]: e.target.value }))}
                        placeholder="Bank / gateway reference"
                        aria-label={`Payment reference for ${d.title ?? d.id}`}
                      />
                    </label>
                    <p className={styles.meta}>Submitting a reference does NOT confirm your seat. DI verifies payment first.</p>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busyId === d.id}>I have paid</button>
                    </div>
                  </form>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
