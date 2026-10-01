import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { PublicHeader } from '../../components/PublicHeader';
import { supabase } from '../../lib/supabase';
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
 */
export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  function focusSummary() {
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

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
      // Inputs preserved on error only; success navigates.
      navigate(next ?? '/app', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PublicHeader />
      <main className={styles.page} data-testid="page-sign-in">
        <PageHeading kicker="Welcome back" title="Sign in" desc="Sign in with your ElevateMe account email and password." />
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
            <button type="submit" disabled={busy} className={styles.primary}>
              {busy ? 'Signing in…' : 'Sign in'}
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
