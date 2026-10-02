import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError } from '../../lib/api';
import {
  buildExchangeFragment,
  cleanedGuestUrl,
  isExpiredOrRevoked,
} from '../../features/guest-invite/types';
import {
  exchangeGuestToken,
  getGuestRosterScoped,
  getGuestSession,
  type GuestRosterRow,
} from '../../features/guest-invite/api';
import { filterGuestRoster, guestSheetPath } from '../../features/guest-invite/helpers';
import styles from './GuestInvitePage.module.css';

/**
 * /evaluate/invite (entry) + /evaluate/session (roster) — guest evaluator roster.
 * Invite link (/evaluate/invite#t=...?sessionId=) -> exchange -> HttpOnly
 * guest_session cookie -> scope-resolved roster (names + status only, no
 * contacts/history) -> click student -> editable sheet at
 * /evaluate/students/:studentId. Session IDs are resolved from the invitation
 * scope (URL query + cookie) — the guest is never asked to type DB/session IDs.
 * No report release button is offered to guests (staff-only, 403).
 */
export function GuestInvitePage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'exchanging' | 'ready' | 'expired' | 'error'>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const [roster, setRoster] = useState<GuestRosterRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [conflict, setConflict] = useState(false);

  const doExchange = useCallback(async (fragment: string) => {
    setStatus('exchanging');
    setDetail(null);
    try {
      await exchangeGuestToken(fragment);
      // Cleanup: strip fragment immediately so the token never leaks.
      try {
        window.history.replaceState(null, '', cleanedGuestUrl(window.location.href));
      } catch {
        window.location.hash = '';
      }
      setStatus('ready');
    } catch (e) {
      try {
        window.history.replaceState(null, '', cleanedGuestUrl(window.location.href));
      } catch {
        /* noop */
      }
      if (e instanceof ApiError && isExpiredOrRevoked(e.status, e.code)) {
        setStatus('expired');
      } else {
        setStatus('error');
        setDetail(e instanceof ApiError ? e.message : 'Exchange failed.');
      }
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const fragment = buildExchangeFragment(hash);
    if (!fragment) {
      // No fragment: if a guest cookie already exists (or a sessionId query from the
      // invitation link), allow roster lookup from scope — never ask for IDs.
      setStatus('ready');
      return;
    }
    // Never log the token.
    void doExchange(fragment);
  }, [doExchange]);

  const loadRoster = useCallback(async () => {
    setLoadingRoster(true);
    setDetail(null);
    setConflict(false);
    try {
      // Resolve the assigned session from the invitation scope (cookie), falling
      // back to the ?sessionId= carried by the invitation link (not user-typed).
      let scopedSession: string | undefined;
      try {
        const scope = await getGuestSession();
        if (scope.sessionId) scopedSession = scope.sessionId;
      } catch {
        /* fall back to link query */
      }
      const linkSession = searchParams.get('sessionId') ?? undefined;
      const res = await getGuestRosterScoped(
        scopedSession ? undefined : linkSession ? { sessionId: linkSession } : undefined,
      );
      // Strip to names + status only (no contacts/history); server already enforces scope.
      const visible = filterGuestRoster(res.rows);
      setRoster(visible);
      if (visible.length === 0) {
        setDetail('No students assigned to this invitation yet. Ask your coordinator if this looks wrong.');
      }
    } catch (e) {
      if (e instanceof ApiError && isExpiredOrRevoked(e.status, e.code)) setStatus('expired');
      else if (e instanceof ApiError && (e.status === 409 || e.code === 'VERSION_CONFLICT')) setConflict(true);
      else if (e instanceof ApiError && (e.status === 404 || e.code === 'NOT_FOUND')) {
        setDetail('Not found — this invitation covers a different session.');
      } else setDetail(e instanceof ApiError ? e.message : 'Failed to load roster.');
    } finally {
      setLoadingRoster(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (status === 'ready') void loadRoster();
  }, [status, loadRoster]);

  if (status === 'idle' || status === 'exchanging') {
    return (
      <main className={styles.page} data-testid="evaluate-invite">
        <PageHeading title="Guest invite" desc="Exchanging your one-time invitation…" />
        <p role="status">{status === 'exchanging' ? 'Verifying invitation…' : 'Waiting for invitation fragment (#t=…). Ask staff for a fresh link if you arrived without one.'}</p>
        {status === 'idle' && (
          <p><Link to="/">Back home</Link></p>
        )}
      </main>
    );
  }

  if (status === 'expired') {
    return (
      <main className={styles.page} data-testid="evaluate-invite-expired">
        <PageHeading title="Invitation expired" />
        <EmptyState title="Request a new link" body="This invitation is expired or revoked. Ask your coordinator for a fresh guest link." />
        <p className={styles.meta}>Your old link was cleared from the address bar and was never stored.</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className={styles.page} data-testid="evaluate-invite">
        <PageHeading title="Guest invite" />
        <p role="alert" className={styles.error}>{detail ?? 'Exchange failed.'}</p>
        <p><Link to="/">Back home</Link></p>
      </main>
    );
  }

  return (
    <main className={styles.page} data-testid="evaluate-session">
      <PageHeading title="Guest evaluations" desc="Your assigned students — names + status only. Select a student to open their editable sheet." />
      {conflict && (
        <div role="alert" className={styles.conflict} data-testid="revision-conflict">
          <strong>Someone else updated the roster.</strong> Refresh and try again.
          <button type="button" onClick={() => { setConflict(false); void loadRoster(); }}>Refresh</button>
        </div>
      )}
      <div className={styles.row}>
        <button type="button" onClick={() => void loadRoster()} disabled={loadingRoster}>
          {loadingRoster ? 'Loading…' : 'Refresh roster'}
        </button>
      </div>
      {detail && <p role="status" className={styles.meta}>{detail}</p>}
      {roster.length > 0 && (
        <ul className={styles.list}>
          {roster.map((r) => {
            const studentId = r.studentId ?? r.id;
            return (
              <li key={r.id} data-testid="guest-roster-row">
                {r.name ?? 'Student'} {r.elevateMeId ? `· ${r.elevateMeId}` : ''} {r.reportStatus ? `· ${r.reportStatus}` : ''}
                {' '}
                <Link to={guestSheetPath(studentId)} data-testid="guest-open-sheet">Open sheet</Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
