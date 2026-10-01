import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ApiError } from '../../lib/api';
import { listMyRegistrations, withdrawRegistration } from '../../features/programs/api';
import { canWithdraw, nextStepsForStatus } from '../../features/programs/helpers';
import type { Registration } from '../../features/programs/types';
import styles from './RegistrationsPage.module.css';

/**
 * /app/registrations — register once, allocation view, withdraw before deadline.
 * Attendance is never inferred from registration/receipt.
 */
export function RegistrationsPage() {
  const [regs, setRegs] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setRegs(await listMyRegistrations());
      } catch (e) {
        setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load registrations.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function doWithdraw(id: string) {
    try {
      const updated = await withdrawRegistration(id);
      setRegs((r) => r.map((x) => (x.id === id ? updated : x)));
      setNotice('Registration withdrawn.');
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Withdraw failed.');
    } finally {
      setConfirmId(null);
    }
  }

  return (
    <main className={styles.page} data-testid="app-registrations">
      <PageHeading title="My registrations" desc="Status, allocation, and next steps. One active registration per program." />
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {!loading && !error && regs.length === 0 && (
        <EmptyState
          title="No registrations"
          body="Discover a standard program and register once."
          action={<Link to="/app/programs">Discover programs</Link>}
        />
      )}
      <ul className={styles.list}>
        {regs.map((r) => (
          <li key={r.id} className={styles.card} data-testid="registration-card">
            <h2><Link to={`/programs/${encodeURIComponent(r.programId)}`}>{r.programTitle}</Link></h2>
            <p><StatusBadge value={r.status} /></p>
            {r.allocation && <p>Allocation: {r.allocation}</p>}
            {(r.committee || r.country || r.sessionId) && (
              <p className={styles.meta}>
                {[r.committee, r.country, r.sessionId].filter(Boolean).join(' · ')}
              </p>
            )}
            <p>{nextStepsForStatus(r.status)}</p>
            {canWithdraw(r) && r.status !== 'WITHDRAWN' ? (
              <button type="button" onClick={() => setConfirmId(r.id)}>Withdraw before deadline</button>
            ) : (
              <p className={styles.meta}>Withdrawal unavailable.</p>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirmId !== null}
        title="Withdraw registration?"
        body="You can re-register while seats remain and before the deadline."
        confirmLabel="Withdraw"
        onConfirm={() => confirmId && void doWithdraw(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </main>
  );
}
