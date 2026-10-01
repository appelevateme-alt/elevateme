import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { PublicHeader } from '../../components/PublicHeader';
import { supabase } from '../../lib/supabase';
import styles from './ResetPasswordPage.module.css';

export const RESET_PASSWORD_UPDATED_COPY = 'Password updated';
export const RESET_LINK_INVALID_COPY =
  'This reset link is expired or invalid. Request a new link.';

/** New password + confirm: min 8 chars and must match. */
export function validateResetPassword(password: string, confirm: string): string[] {
  const list: string[] = [];
  if (password.length < 8) list.push('Password must be at least 8 characters.');
  if (password !== confirm) list.push('Passwords do not match.');
  return list;
}

function paramsOf(raw: string): URLSearchParams {
  const stripped = raw.startsWith('?') || raw.startsWith('#') ? raw.slice(1) : raw;
  try {
    return new URLSearchParams(stripped);
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Recovery code from either the query string (?code= / ?token_hash=) or the
 * hash fragment (#code= / #token_hash=). Null when absent.
 */
export function getRecoveryCodeFromLocation(search: string, hash: string): string | null {
  const q = paramsOf(search);
  const fromQuery = q.get('code') || q.get('token_hash');
  if (fromQuery) return fromQuery;
  const h = paramsOf(hash);
  return h.get('code') || h.get('token_hash');
}

/** True when the URL carries a hash-flow session hint (access_token / type=recovery). */
export function hasRecoverySessionHint(search: string, hash: string): boolean {
  const q = paramsOf(search);
  const h = paramsOf(hash);
  if (h.get('access_token')) return true;
  if (q.get('type') === 'recovery' || h.get('type') === 'recovery') return true;
  return false;
}

/**
 * Supabase error params on the recovery redirect (e.g. ?error=access_denied
 * or #error_code=otp_expired). Returns the description when present.
 */
export function getRecoveryErrorFromLocation(search: string, hash: string): string | null {
  const q = paramsOf(search);
  const h = paramsOf(hash);
  const code = q.get('error_code') || h.get('error_code');
  const desc =
    q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
  if (code || desc) return desc || code || 'Recovery link error.';
  return null;
}

export function isExpiredOrInvalidMessage(message: string): boolean {
  const msg = (message || '').toLowerCase();
  return (
    msg.includes('expired') ||
    msg.includes('invalid') ||
    msg.includes('otp') ||
    msg.includes('token') ||
    msg.includes('not found') ||
    msg.includes('session missing')
  );
}

type LinkState = 'checking' | 'ready' | 'invalid';

/**
 * /reset-password — exchanges a recovery ?code= via
 * supabase.auth.exchangeCodeForSession, supports hash-flow sessions, then
 * supabase.auth.updateUser({ password }).
 * Expired/invalid links show an error + link to /forgot-password for a new link.
 * Success shows "Password updated" + Sign in link.
 */
export function ResetPasswordPage() {
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  function focusSummary() {
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  function markInvalid(message: string) {
    setLinkState('invalid');
    setLinkError(message);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const search = typeof window !== 'undefined' ? window.location.search : '';
        const hash = typeof window !== 'undefined' ? window.location.hash : '';

        const recoveryError = getRecoveryErrorFromLocation(search, hash);
        if (recoveryError) {
          if (!cancelled) markInvalid(RESET_LINK_INVALID_COPY);
          return;
        }

        const code = getRecoveryCodeFromLocation(search, hash);
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;
          if (error) {
            markInvalid(RESET_LINK_INVALID_COPY);
          } else {
            setLinkState('ready');
          }
          return;
        }

        if (hasRecoverySessionHint(search, hash)) {
          // Hash-flow: the client establishes the session from the fragment.
          // Verify a session exists; otherwise the link is stale.
          try {
            const { data } = await supabase.auth.getSession();
            if (cancelled) return;
            if (data.session) {
              setLinkState('ready');
            } else {
              // Optimistically allow the form: updateUser surfaces expiry.
              setLinkState('ready');
            }
          } catch {
            if (!cancelled) setLinkState('ready');
          }
          return;
        }

        // No recovery params: allow only when a recovery session already exists
        // (e.g. code was exchanged and the page re-rendered); otherwise invalid.
        try {
          const { data } = await supabase.auth.getSession();
          if (cancelled) return;
          if (data.session) {
            setLinkState('ready');
          } else {
            markInvalid(RESET_LINK_INVALID_COPY);
          }
        } catch {
          if (!cancelled) markInvalid(RESET_LINK_INVALID_COPY);
        }
      } catch {
        if (!cancelled) markInvalid(RESET_LINK_INVALID_COPY);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const list = validateResetPassword(password, confirm);
    if (list.length > 0) {
      setErrors(list);
      focusSummary();
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (isExpiredOrInvalidMessage(error.message)) {
          markInvalid(RESET_LINK_INVALID_COPY);
          focusSummary();
          return;
        }
        setErrors([error.message || 'Could not update your password. Try again.']);
        focusSummary();
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <PublicHeader />
        <main className={styles.page} data-testid="page-reset-password">
          <PageHeading kicker="Account recovery" title="Reset password" desc="Choose a new password for your account." />
          <div role="status" className={styles.notice} data-testid="reset-password-success">
            <p>{RESET_PASSWORD_UPDATED_COPY}</p>
          </div>
          <p className={styles.meta}>
            <Link to="/sign-in">Sign in</Link>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <PublicHeader />
      <main className={styles.page} data-testid="page-reset-password">
        <PageHeading kicker="Account recovery" title="Reset password" desc="Choose a new password for your account." />
        {linkState === 'checking' && (
          <p role="status" className={styles.notice} data-testid="reset-password-checking">
            Checking your reset link…
          </p>
        )}
        {linkState === 'invalid' && (
          <div role="alert" className={styles.error} data-testid="reset-password-invalid">
            <p>{linkError ?? RESET_LINK_INVALID_COPY}</p>
            <p>
              <Link to="/forgot-password">Request a new link</Link>
            </p>
          </div>
        )}
        {errors.length > 0 && (
          <div ref={summaryRef} role="alert" tabIndex={-1} className={styles.error} data-testid="reset-password-errors">
            <ul>
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {linkState === 'ready' && (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <label className={styles.field}>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-label="New password"
                placeholder="At least 8 characters"
              />
              <span className={styles.hint}>At least 8 characters.</span>
            </label>
            <label className={styles.field}>
              Confirm new password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                aria-label="Confirm new password"
                placeholder="Repeat new password"
              />
            </label>
            <div className={styles.actions}>
              <button type="submit" disabled={busy} className={styles.primary}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
              <Link to="/sign-in">Back to sign in</Link>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
