import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { PublicHeader } from '../../components/PublicHeader';
import { supabase } from '../../lib/supabase';
import { get } from '../../lib/api';
import {
  resolvePostSignInTarget,
  rolesFromMe,
  type MeResponse,
  type Session,
  useAuth,
} from '../../lib/auth';
import styles from './SignInPage.module.css';

export function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

export function signInErrorCopy(message: string): { text: string; unconfirmed: boolean } {
  const msg = (message || '').toLowerCase();
  if (msg.includes('not confirmed') || msg.includes('unconfirmed') || msg.includes('confirm') || msg.includes('verification')) {
    return { text: 'Your email is not confirmed yet. Check your inbox to continue.', unconfirmed: true };
  }
  if (
    msg.includes('invalid') ||
    msg.includes('credentials') ||
    msg.includes('not found') ||
    msg.includes('incorrect') ||
    msg.includes('login')
  ) {
    // 401 inline copy — no status leak, inputs preserved.
    return { text: 'Invalid email or password. Check your details and try again.', unconfirmed: false };
  }
  return { text: message || 'Sign in failed. Try again.', unconfirmed: false };
}

/**
 * /sign-in — email+password via Supabase Auth.
 * Validation inline, 401 inline copy, ?next= redirect, forgot link.
 * Inputs preserved on error; focusable error summary.
 *
 * Phase 1A: never navigate to a fixed /app on success. Instead wait for the
 * AuthProvider session (useAuth loading/session) OR fetch GET /me directly to
 * determine the role dashboard (admin->/admin, staff family->/staff,
 * student/parent->/app). Preserves ?next= when the role permits it, else the
 * role dashboard. Shows a resolving state while the session settles so guards
 * (RequireAuth) never see a premature null session and bounce back to sign-in.
 */
export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [justSignedIn, setJustSignedIn] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const didNavigateRef = useRef(false);

  function focusSummary() {
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  function go(target: string) {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;
    navigate(target, { replace: true });
  }

  // Already signed in (visited /sign-in while authenticated): leave to the
  // role-correct destination instead of showing the form again.
  useEffect(() => {
    if (justSignedIn || didNavigateRef.current) return;
    if (!authLoading && session) {
      go(resolvePostSignInTarget(session, next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session, next]);

  // Fallback: after a successful password sign-in, wait for the provider
  // session. If the direct /me fetch in onSubmit already navigated, this is a
  // no-op thanks to didNavigateRef (avoids a redirect loop).
  useEffect(() => {
    if (!justSignedIn || didNavigateRef.current) return;
    if (authLoading || resolving) return;
    if (session) {
      go(resolvePostSignInTarget(session, next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justSignedIn, authLoading, resolving, session, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUnconfirmed(false);
    const list: string[] = [];
    const cleanEmail = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) list.push('Enter a valid email address.');
    if (!password) list.push('Enter your password.');
    if (list.length > 0) {
      setErrors(list);
      focusSummary();
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) {
        const mapped = signInErrorCopy(error.message);
        setUnconfirmed(mapped.unconfirmed);
        setErrors([mapped.text]);
        focusSummary();
        return;
      }
      if (!data?.user) {
        setErrors(['Sign in failed. Try again.']);
        focusSummary();
        return;
      }
      // Success: resolve the role-correct destination from DB roles.
      // Do NOT navigate to a fixed /app — wait for the session or /me.
      setJustSignedIn(true);
      setResolving(true);
      try {
        const me = await get<MeResponse>('/me');
        const roles = rolesFromMe(me);
        const temp: Session = {
          userId: me.id,
          email: me.email,
          roles,
          activeRole: roles[0],
          status: me.status ?? 'Approved',
        };
        // Prefer the live provider session (respects activeRole switches);
        // fall back to the just-fetched /me while the provider settles.
        const effective = session ?? temp;
        go(resolvePostSignInTarget(effective, next));
      } catch {
        // /me fetch failed here: leave navigation to the effect above, which
        // waits for the AuthProvider session (SIGNED_IN -> resolveSession).
        // Stay in the resolving/loading state until then.
      } finally {
        setResolving(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const showResolving = justSignedIn && (busy || resolving || authLoading) && !didNavigateRef.current;

  return (
    <>
      <PublicHeader />
      <main className={styles.page} data-testid="page-sign-in">
        <PageHeading kicker="Welcome back" title="Sign in" desc="Sign in with your ElevateMe account email and password." />
        {showResolving && (
          <p role="status" className={styles.notice} data-testid="sign-in-resolving">
            Signing you in…
          </p>
        )}
        {errors.length > 0 && (
          <div ref={summaryRef} role="alert" tabIndex={-1} className={styles.error} data-testid="sign-in-errors">
            <ul>
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {unconfirmed && (
              <p>
                <Link to={`/verify-email?email=${encodeURIComponent(email.trim())}`}>Go to email verification</Link>
              </p>
            )}
          </div>
        )}
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.field}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-label="Email"
              placeholder="you@example.edu"
            />
          </label>
          <label className={styles.field}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-label="Password"
              placeholder="Password"
            />
          </label>
          <div className={styles.actions}>
            <button type="submit" disabled={busy || resolving} className={styles.primary}>
              {busy ? 'Signing in…' : resolving ? 'Finding your workspace…' : 'Sign in'}
            </button>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </form>
        <p className={styles.meta}>
          New here? <Link to="/sign-up">Create an account</Link>
        </p>
      </main>
    </>
  );
}
