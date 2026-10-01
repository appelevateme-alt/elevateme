import { useEffect, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api';
import { listAdminPayments, verifyPaymentRecord, expirePaymentHolds } from '../../features/development/api';
import { paymentPendingAge } from '../../features/development/helpers';
import type { PaymentRecord } from '../../features/development/types';
import styles from './AdminPhase5.module.css';

/**
 * /admin/payments — verify or reject payment references
 * + pending age + hold extension.
 */
export function AdminPaymentsPage() {
  const [items, setItems] = useState<PaymentRecord[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setItems(await listAdminPayments());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Failed to load payments.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handle(action: 'verify' | 'reject', id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      if (action === 'verify') {
        await verifyPaymentRecord(id, { decision: 'VERIFIED' });
      } else {
        const reason = (reasons[id] ?? '').trim();
        if (!reason) {
          setNotice('A reason is required to reject.');
          setBusyId(null);
          return;
        }
        await verifyPaymentRecord(id, { decision: 'REJECTED', reason });
      }
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: action === 'verify' ? 'Verified' : 'Rejected' } : p)));
      setNotice(action === 'verify' ? 'Payment verified.' : 'Payment rejected.');
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleExpireSweep() {
    setNotice(null);
    try {
      await expirePaymentHolds();
      setNotice('Expiry sweep done.');
      setItems(await listAdminPayments());
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Sweep failed.');
    }
  }

  return (
    <main className={styles.page} data-testid="page-admin-payments">
      <PageHeading title="Payments" desc="Verify or reject payment references." />
      <p className={styles.meta}>Holds expire automatically, see docs. Run the expiry sweep to clear past-expiry holds.</p>
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {!loading && !error && (
        <div className={styles.actions}>
          <button type="button" onClick={handleExpireSweep}>Run expiry sweep</button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="No payments" body="Submitted payment references will appear here." />
      )}
      {items.length > 0 && (
        <div className={styles.tableWrap} role="region" aria-label="Payments" tabIndex={0}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Student</th><th scope="col">Amount</th><th scope="col">Reference</th><th scope="col">Age</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.studentName ?? p.reference ?? '—'}</td>
                <td>{p.amount ?? '—'} {p.currency ?? ''}</td>
                <td>{p.reference ?? '—'}</td>
                <td>{paymentPendingAge(p)}</td>
                <td><StatusBadge value={String(p.status ?? 'Pending')} /></td>
                <td>
                  <div className={styles.actions}>
                    <button type="button" disabled={busyId === p.id} onClick={() => handle('verify', p.id)}>Verify</button>
                    <button type="button" disabled={busyId === p.id} onClick={() => handle('reject', p.id)}>Reject</button>
                  </div>
                  <label className={styles.field}>Reject reason (required)
                    <input
                      value={reasons[p.id] ?? ''}
                      onChange={(e) => setReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="Reason for rejection"
                      aria-label={`Reject reason for ${p.studentName ?? p.reference ?? 'payment'}`}
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}
