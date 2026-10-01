import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError } from '../../lib/api';
import { CRITERIA_10, CRITERIA_LABELS } from '../../lib/scoring';
import {
  buildExchangeFragment,
  cleanedGuestUrl,
  extractFragmentToken,
  isExpiredOrRevoked,
} from '../../features/guest-invite/types';
import { exchangeGuestToken, getGuestRoster, type GuestRosterRow } from '../../features/guest-invite/api';
import { getGuestEvaluationSheet } from '../../features/evaluation-sheet/api';
import type { EvaluationSheet } from '../../features/evaluation-sheet/types';
import styles from './GuestInvitePage.module.css';

/**
 * /evaluate/invite — guest entry via one-time fragment (#t=...).
 * POST /guest/exchange sets the HttpOnly guest_session cookie (same-origin),
 * then history.replaceState strips the fragment so the token never leaks
 * (no logging, no storage). Expired/revoked => request-new-link (no leak).
 * Guests see roster + released sheets only. 409 => revision conflict UI.
 */
export function GuestInvitePage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'exchanging' | 'ready' | 'expired' | 'error'>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => searchParams.get('sessionId') ?? '');
  const [roster, setRoster] = useState<GuestRosterRow[]>([]);
  const [sheet, setSheet] = useState<EvaluationSheet | null>(null);
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
        setDetail(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Exchange failed.');
      }
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const fragment = buildExchangeFragment(hash);
    if (!fragment) {
      // No fragment: if a guest cookie already exists, allow roster lookup by sessionId.
      if (searchParams.get('sessionId')) setStatus('ready');
      return;
    }
    // Never log the token.
    void doExchange(fragment);
    void extractFragmentToken;
  }, [doExchange, searchParams]);

  async function loadRoster() {
    if (!sessionId.trim()) {
      setDetail('Enter the session ID from your invitation.');
      return;
    }
    setDetail(null);
    setConflict(false);
    try {
      const res = await getGuestRoster(sessionId.trim());
      setRoster(res.rows);
      if (res.rows.length === 0) setDetail('No roster entries for this invitation (guests see roster + released sheets only).');
    } catch (e) {
      if (e instanceof ApiError && isExpiredOrRevoked(e.status, e.code)) setStatus('expired');
      else if (e instanceof ApiError && (e.status === 409 || e.code === 'VERSION_CONFLICT')) setConflict(true);
      else setDetail(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load roster.');
    }
  }

  async function openSheet(evaluationId: string) {
    setDetail(null);
    setConflict(false);
    try {
      setSheet(await getGuestEvaluationSheet(evaluationId));
    } catch (e) {
      if (e instanceof ApiError && isExpiredOrRevoked(e.status, e.code)) setStatus('expired');
      else if (e instanceof ApiError && (e.status === 404 || e.code === 'NOT_FOUND')) {
        setDetail('Not found — guests can only open released sheets in their invitation scope.');
      } else if (e instanceof ApiError && (e.status === 409 || e.code === 'VERSION_CONFLICT')) {
        setConflict(true);
      } else setDetail(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to open sheet.');
    }
  }

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
    <main className={styles.page} data-testid="evaluate-invite">
      <PageHeading title="Guest evaluations" desc="Roster + released sheets only. Your session cookie is HttpOnly and never exposed to scripts." />
      {conflict && (
        <div role="alert" className={styles.conflict} data-testid="revision-conflict">
          <strong>Revision conflict.</strong> The sheet changed — refresh and retry.
          <button type="button" onClick={() => { setConflict(false); void loadRoster(); }}>Refresh</button>
        </div>
      )}
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          void loadRoster();
        }}
      >
        <label>Session ID
          <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Session ID from invitation" aria-label="Session ID" />
        </label>
        <button type="submit">Load roster</button>
      </form>
      {detail && <p role="status" className={styles.meta}>{detail}</p>}
      {roster.length > 0 && (
        <ul className={styles.list}>
          {roster.map((r) => (
            <li key={r.id} data-testid="guest-roster-row">
              {r.name ?? r.id} {r.elevateMeId ? `· ${r.elevateMeId}` : ''} {r.reportStatus ? `· ${r.reportStatus}` : ''}
              {' '}
              {(r.evaluationId || r.id) && (
                <button type="button" onClick={() => void openSheet(r.evaluationId ?? r.id)}>Open sheet</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sheet && (
        <section aria-label="Released sheet" className={styles.sheet} data-testid="guest-sheet">
          <h2>Released sheet — {sheet.studentName ?? sheet.studentId}</h2>
          <dl className={styles.dl}>
            {CRITERIA_10.map((k) => (
              <div key={k}>
                <dt>{CRITERIA_LABELS[k]}</dt>
                <dd>{sheet.scores[k] ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <p role="status">Total {sheet.total ?? '—'} / 1000 · Average {sheet.average ?? '—'} / 100 (server authoritative)</p>
          {sheet.notes && <p>Remarks: {sheet.notes}</p>}
          <button type="button" onClick={() => setSheet(null)}>Close</button>
        </section>
      )}
    </main>
  );
}
