import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { PublicHeader } from '../../components/PublicHeader';
import { supabase } from '../../lib/supabase';
import styles from './ForgotPasswordPage.module.css';

/** Generic anti-enumeration copy — shown on both success and error. */
export const FORGOT_PASSWORD_SENT_COPY = 'If an account exists, a reset link has been sent';

export function validateForgotPasswordEmail(email: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'Enter a valid email address.';
  return null;
}

/** redirectTo for resetPasswordForEmail: origin + /reset-password. */
export function buildResetRedirect(origin: string): string {
  const clean = origin.replace(/\/$/, '');
  return `${clean}/reset-password`;
}

export function resetRedirectForCurrentOrigin(): string | undefined {
  if (typeof window === 'undefined' || !window.location?.origin) return undefined;
  return buildResetRedirect(window.location.origin);
}

/**
 * /forgot-password — email input -> supabase.auth.resetPasswordForEmail.
 * Always shows the generic sent copy (success and error) to avoid
 * account enumeration. Loading state on the submit button, resend supported.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  function focusSummary() {
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function send(toEmail: string) {
    const cleanEmail = toEmail.trim();
    setBusy(true);
    try {
      const redirectTo = resetRedirectForCurrentOrigin();
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        ...(redirectTo ? { redirectTo } : {}),
      });
      // Intentionally ignore `error`: always show the generic copy so the
      // existence of an account cannot be probed via this form.
      void error;
      setSent(true);
      setErrors([]);
    } catch {
      // Network failure etc. — still show the generic copy.
      setSent(true);
      setErrors([]);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateForgotPasswordEmail(email);
    if (invalid) {
      setErrors([invalid]);
      focusSummary();
      return;
    }
    await send(email);
  }

  async function onResend() {
    const invalid = validateForgotPasswordEmail(email);
    if (invalid) {
      setErrors([invalid]);
      focusSummary();
      return;
    }
    await send(email);
  }

  return (
    <>
      <PublicHeader />
      <main className={styles.page} data-testid="page-forgot-password">
        <PageHeading
          kicker="Account recovery"
          title="Forgot password"
          desc="Enter your account email and we will send a time-limited reset link."
        />
        {errors.length > 0 && (
          <div ref={summaryRef} role="alert" tabIndex={-1} className={styles.error} data-testid="forgot-password-errors">
            <ul>
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {sent && (
          <div role="status" className={styles.notice} data-testid="forgot-password-sent">
            <p>{FORGOT_PASSWORD_SENT_COPY}</p>
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
          <div className={styles.actions}>
            {!sent ? (
              <button type="submit" disabled={busy} className={styles.primary}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            ) : (
              <button type="button" disabled={busy} className={styles.primary} onClick={onResend}>
                {busy ? 'Sending…' : 'Resend link'}
              </button>
            )}
            <Link to="/sign-in">Back to sign in</Link>
          </div>
        </form>
        {sent && (
          <p className={styles.meta}>
            Didn&apos;t get it? Check spam, then use Resend. Link expires — <Link to="/sign-in">Back to sign in</Link>
          </p>
        )}
      </main>
    </>
  );
}
