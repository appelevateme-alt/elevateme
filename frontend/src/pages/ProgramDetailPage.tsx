import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PublicHeader } from '../components/PublicHeader';
import { PageHeading } from '../components/PageHeading';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ApiError, toErrorStateFrom } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getProgram, withdrawRegistration, listMyRegistrations } from '../features/programs/api';
import { canWithdraw, isPublicStandard, remainingCapacity } from '../features/programs/helpers';
import { RegistrationPanel } from '../features/programs/RegistrationPanel';
import type { Program, Registration } from '../features/programs/types';
import styles from './ProgramDetailPage.module.css';

/** Public program detail: description, sessions/committees, eligibility, dates, capacity, registration CTA. */
export function ProgramDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [mine, setMine] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'forbidden' | 'not-found' | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [denied, setDenied] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getProgram(id ?? '');
        if (!isPublicStandard(p)) {
          // Targeted development programs are never publicly visible (404, no enumeration).
          setNotFound(true);
          return;
        }
        setProgram(p);
        if (session) {
          try {
            const regs = await listMyRegistrations();
            setMine(regs.find((r) => r.programId === p.id) ?? null);
          } catch { /* registrations unavailable — still show program */ }
        }
      } catch (e) {
        const state = toErrorStateFrom(e);
        if (state === 'notfound') {
          setNotFound(true);
          setErrorKind('not-found');
        } else if (state === 'denied' || state === 'pending') {
          setDenied(true);
          setErrorKind('forbidden');
        } else setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load program.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return (<><PublicHeader /><main className={styles.page}><p role="status">Loading…</p></main></>);
  if (denied) {
    return (<><PublicHeader /><main className={styles.page} data-testid="forbidden"><PageHeading title="Permission denied" /><EmptyState title="Permission denied" body="You do not have access to this program." /></main></>);
  }
  if (notFound || !program) {
    return (<><PublicHeader /><main className={styles.page} data-testid="not-found"><PageHeading title="Not found" /><EmptyState title="Not found" body="Program not found." /></main></>);
  }
  if (error) {
    if (errorKind === 'forbidden') {
      return (<><PublicHeader /><main className={styles.page} data-testid="forbidden"><p role="alert" className={styles.error}>{error}</p></main></>);
    }
    if (errorKind === 'not-found') {
      return (<><PublicHeader /><main className={styles.page} data-testid="not-found"><p role="alert" className={styles.error}>{error}</p></main></>);
    }
    return (<><PublicHeader /><main className={styles.page}><p role="alert" className={styles.error}>{error}</p></main></>);
  }

  const left = remainingCapacity(program);
  const next = encodeURIComponent(location.pathname + location.search);

  async function doWithdraw() {
    if (!mine) return;
    try {
      const updated = await withdrawRegistration(mine.id);
      setMine(updated);
      setNotice('Registration withdrawn.');
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Withdraw failed.');
    } finally {
      setConfirmWithdraw(false);
    }
  }

  return (
    <>
      <PublicHeader />
      <main className={styles.page} data-testid="program-detail">
        <PageHeading kicker={`${program.kind} · ${program.theme}`} title={program.title} desc={program.organizer} />
        <p><StatusBadge value={program.lifecycle} /> <span className={styles.meta}>{program.startsAt} → {program.endsAt} · {program.location}</span></p>
        <section aria-label="Description"><h2>About</h2><p>{program.description}</p></section>
        <section aria-label="Sessions and committees">
          <h2>Sessions & committees</h2>
          <ul>
            {program.sessions.map((s) => (
              <li key={s.id}>{s.title} — {s.startsAt} → {s.endsAt}{s.committee ? ` · ${s.committee}` : ''}{s.location ? ` · ${s.location}` : ''}</li>
            ))}
          </ul>
          {program.committees.length > 0 && (
            <ul>
              {program.committees.map((c) => (
                <li key={c.id}>{c.name}: {c.countries.join(', ')}</li>
              ))}
            </ul>
          )}
        </section>
        {program.eligibility && <section aria-label="Eligibility"><h2>Eligibility</h2><p>{program.eligibility}</p></section>}
        <p className={styles.meta}>Remaining capacity: {left} of {program.capacity}</p>
        {notice && <p role="status" className={styles.notice}>{notice}</p>}
        {!session ? (
          <p><Link to={`/sign-in?next=${next}`}>Sign in to register</Link></p>
        ) : mine ? (
          <section className={styles.mine} data-testid="my-registration">
            <h2>Your registration: {mine.status}</h2>
            {mine.allocation && <p>Allocation: {mine.allocation}</p>}
            {canWithdraw(mine) ? (
              <>
                <button type="button" onClick={() => setConfirmWithdraw(true)}>Withdraw before deadline</button>
                <ConfirmDialog
                  open={confirmWithdraw}
                  title="Withdraw registration?"
                  body="You can re-register while seats remain and before the deadline."
                  confirmLabel="Withdraw"
                  onConfirm={() => void doWithdraw()}
                  onCancel={() => setConfirmWithdraw(false)}
                />
              </>
            ) : (
              <p className={styles.meta}>Withdrawal is no longer available for this registration.</p>
            )}
            <p><button type="button" onClick={() => navigate('/app/registrations')}>View my registrations</button></p>
          </section>
        ) : (
          <RegistrationPanel program={program} />
        )}
      </main>
    </>
  );
}
