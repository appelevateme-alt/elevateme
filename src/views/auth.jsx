import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorSummary, PageHead, Progress } from '../components/ui.jsx';
import { roleHome, useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabaseClient.js';

// Shared public header for auth pages.
function AuthHead({ children }) {
  return (
    <>
      <header className="public-nav"><div className="inner">
        <Link className="public-brand" to="/">Elevate<span>Me</span></Link>
        <nav className="public-links"><Link to="/programs">Programs</Link><Link className="button" to="/sign-up">Create account →</Link></nav>
      </div></header>
      <main className="public-main" style={{ maxWidth: 720 }}>{children}</main>
    </>
  );
}

function safeNext(value) {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

function statusRoute(status, activeRole) {
  if (status === 'PendingReview') return '/pending-approval';
  if (status === 'ChangesRequested') return '/pending-approval?status=changes';
  if (status === 'Rejected') return '/account-rejected';
  if (status === 'Suspended') return '/account-suspended';
  return roleHome(activeRole) || '/';
}

export function SignIn() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const next = safeNext(searchParams.get('next'));

  useEffect(() => {
    if (loading || !session) return;
    if (session.status === 'Approved') {
      navigate(next || roleHome(session.role) || '/', { replace: true });
    } else {
      navigate(statusRoute(session.status, session.role), { replace: true });
    }
  }, [loading, session, navigate, next]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUnconfirmedEmail('');
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const { data, error: signError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (signError) {
        const msg = (signError.message || '').toLowerCase();
        if (msg.includes('not confirmed') || msg.includes('unconfirmed') || msg.includes('confirm') || msg.includes('verification')) {
          setUnconfirmedEmail(cleanEmail);
          setError('Your email is not confirmed yet. Verify your inbox to continue.');
        } else if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('not found') || msg.includes('incorrect')) {
          setError('Invalid email or password. Check your details and try again.');
        } else {
          setError(signError.message || 'Sign in failed. Try again.');
        }
        return;
      }
      const user = data?.user;
      if (!user) {
        setError('Sign in failed. Try again.');
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('status,active_role')
        .eq('id', user.id)
        .single();
      if (profileError || !profile) {
        navigate('/pending-approval');
        return;
      }
      if (profile.status !== 'Approved') {
        navigate(statusRoute(profile.status, profile.active_role));
        return;
      }
      navigate(next || roleHome(profile.active_role) || '/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthHead>
      <PageHead kicker="Welcome back" title="Sign in." desc="Sign in with your ElevateMe account email and password." />
      <section className="panel"><div className="panel-head"><h2>Your account</h2><span className="tag">Email + password</span></div>
        <div className="panel-body">
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 18 }}>
            <div className="field"><label> Email<input type="email" required placeholder="you@example.edu" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label></div>
            <div className="field"><label> Password<input type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label></div>
            {error && (
              <p role="alert" className="field-error">{error}{' '}
                {unconfirmedEmail && (
                  <Link to={`/check-email?email=${encodeURIComponent(unconfirmedEmail)}`} className="link-quiet">Go to email verification →</Link>
                )}
              </p>
            )}
            <div><Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></div>
            <p style={{ fontSize: '.88rem' }}>
              <Link to="/forgot-password" className="link-quiet">Forgot password?</Link>
              <span style={{ color: 'var(--muted)' }}> · New here? </span>
              <Link to="/sign-up" className="link-quiet">Create an account</Link>
            </p>
            <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Pending, rejected, suspended, or changes-requested accounts see an explicit status screen after sign-in.</p>
          </form>
        </div>
      </section>
    </AuthHead>
  );
}

/* 5-step create-account flow: role → account → profile →
   photo/verification → review/consent, with per-step validation, error
   summary, session draft persistence (never the password) and a pending-approval confirmation. */
const EMPTY = { role: 'student', fullName: '', email: '', institute: '', dob: '', referee: '', phone: '', consent: false };
const STEPS = ['Choose role', 'Account details', 'Profile information', 'Photo and verification', 'Review and submit'];
const DRAFT_KEY = 'em-signup-draft';

function loadDraft() {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem(DRAFT_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const clean = { ...parsed };
        delete clean.password;
        return { ...EMPTY, ...clean };
      }
    }
  } catch { /* ignore */ }
  return EMPTY;
}

export function SignUp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fixMode = searchParams.get('fix') === '1' || searchParams.get('status') === 'changes';
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(loadDraft);
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({});
  const [submitErrors, setSubmitErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [authUserId, setAuthUserId] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* ignore */ }
  }, [draft]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const errors = useMemo(() => {
    const e = {};
    if (!draft.fullName.trim()) e.fullName = 'Enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) e.email = 'Enter a valid email address.';
    if (password.length < 8) e.password = 'Password must be at least 8 characters.';
    if ((draft.role === 'student' || draft.role === 'coordinator') && !draft.institute.trim()) e.institute = 'Enter your institute.';
    if (draft.role === 'student' && !draft.dob) e.dob = 'Enter your date of birth.';
    return e;
  }, [draft, password]);

  const stepErrorList = (s) => {
    if (s === 2) return [errors.fullName, errors.email, errors.password].filter(Boolean);
    if (s === 3) return [errors.institute, errors.dob].filter(Boolean);
    if (s === 5) return [...Object.values(errors), ...(!draft.consent ? ['Accept consent and privacy to submit.'] : [])];
    return [];
  };

  const createAuthAccount = async () => {
    const cleanEmail = draft.email.trim();
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/check-email?email=${encodeURIComponent(cleanEmail)}` : undefined;
    const { data, error: signError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: draft.fullName.trim() },
        ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
      },
    });
    if (signError) {
      const msg = (signError.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate') || msg.includes('already in use')) {
        throw new Error('An account with this email already exists. Try signing in or resetting your password.');
      }
      throw new Error(signError.message || 'Could not create your login. Try again.');
    }
    const uid = data?.user?.id || null;
    if (uid) setAuthUserId(uid);
    return uid;
  };

  const handleStep2Continue = async () => {
    const list = stepErrorList(2);
    if (list.length > 0) {
      setSubmitErrors(list);
      setTouched({ fullName: true, email: true, password: true, institute: true, dob: true });
      return;
    }
    setSubmitErrors([]);
    if (authUserId) {
      setStep((s) => Math.min(STEPS.length, s + 1));
      return;
    }
    setBusy(true);
    try {
      await createAuthAccount();
      setStep((s) => Math.min(STEPS.length, s + 1));
    } catch (err) {
      setSubmitErrors([err.message || 'Could not create your login. Try again.']);
    } finally {
      setBusy(false);
    }
  };

  const handleFinalSubmit = async () => {
    const list = stepErrorList(5);
    if (list.length > 0) {
      setSubmitErrors(list);
      return;
    }
    setSubmitErrors([]);
    setBusy(true);
    try {
      let uid = authUserId;
      if (!uid) {
        uid = await createAuthAccount();
      }
      if (!uid) {
        try {
          const { data } = await supabase.auth.getUser();
          uid = data?.user?.id || null;
        } catch { /* ignore */ }
      }
      if (!uid) {
        setSubmitErrors(['Could not confirm your login. Check your email for the verification link, then sign in.']);
        return;
      }
      const { error: upsertError } = await supabase.from('profiles').upsert(
        {
          id: uid,
          email: draft.email.trim(),
          full_name: draft.fullName.trim(),
          institute: draft.institute.trim() || null,
          dob: draft.dob || null,
          phone: draft.phone.trim() || null,
          referee: draft.referee.trim() || null,
          status: 'PendingReview',
          active_role: draft.role,
          roles: [draft.role],
        },
        { onConflict: 'id' },
      );
      if (upsertError) {
        setSubmitErrors([upsertError.message || 'Could not save your profile. Try again.']);
        return;
      }
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch { /* ignore */ }
      setPassword('');
      setDone(true);
    } catch (err) {
      setSubmitErrors([err.message || 'Submission failed. Try again.']);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthHead>
        <PageHead kicker="Account created" title="Pending approval." desc="Your account is awaiting email verification and role approval." />
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>What happens next.</strong> Verify your email, then a Diplomatic Impact administrator reviews {draft.role} access.
          You will be notified when your account is approved. Students receive an ElevateMe ID at that point.
        </div>
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>Check your inbox.</strong> We sent a confirmation link to {draft.email || 'your email'}. Confirm it, then track progress on the pending approval page.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to={`/check-email?email=${encodeURIComponent(draft.email.trim())}`} className="button">Verify email steps</Link>
          <Link to="/pending-approval" className="button secondary">Continue to status</Link>
          <Button variant="secondary" onClick={() => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setDraft(EMPTY); setPassword(''); setStep(1); setDone(false); setAuthUserId(null); }}>Start over</Button>
        </div>
      </AuthHead>
    );
  }

  return (
    <AuthHead>
      <PageHead kicker="Create your account" title="Join ElevateMe." desc="Short steps instead of one long form. Drafts stay on this device during the session." />
      <Progress value={step} max={STEPS.length} label={STEPS[step - 1]} />
      {fixMode && step === 1 && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <strong>Changes requested.</strong> An administrator asked for corrections. Review each step and resubmit — your updated details return to the approval queue.
        </div>
      )}
      <ErrorSummary items={submitErrors} />
      <section className="panel">
        <div className="panel-head"><h2>{STEPS[step - 1]}</h2><span className="tag">Step {step} of {STEPS.length}</span></div>
        <div className="panel-body">
          {step === 1 && (
            <div className="field"><label> Choose your role
              <select value={draft.role} onChange={(e) => set('role', e.target.value)}>
                <option value="student">Student</option>
                <option value="coordinator">Teacher / programme coordinator</option>
                <option value="parent">Parent or guardian (via invitation)</option>
              </select></label>
            </div>
          )}
          {step === 2 && (
            <div className="form-grid">
              <div className="field"><label> Full name<input value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, fullName: true }))} placeholder="Full name" autoComplete="name" /></label>
                {touched.fullName && errors.fullName && <p role="alert" className="field-error">{errors.fullName}</p>}</div>
              <div className="field"><label> Email<input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, email: true }))} placeholder="you@example.edu" autoComplete="email" /></label>
                {touched.email && errors.email && <p role="alert" className="field-error">{errors.email}</p>}</div>
              <div className="field span-two"><label> Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, password: true }))} placeholder="Choose a password" autoComplete="new-password" /></label>
                <span className="field-hint">At least 8 characters. Never stored on this device.</span>
                {touched.password && errors.password && <p role="alert" className="field-error">{errors.password}</p>}</div>
            </div>
          )}
          {step === 3 && (
            <div className="form-grid">
              {(draft.role === 'student' || draft.role === 'coordinator') && (
                <div className="field"><label> Institute<input value={draft.institute} onChange={(e) => set('institute', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, institute: true }))} placeholder="Institute" /></label>
                  {touched.institute && errors.institute && <p role="alert" className="field-error">{errors.institute}</p>}</div>
              )}
              {draft.role === 'student' && (
                <>
                  <div className="field"><label> Date of birth<input type="date" value={draft.dob} onChange={(e) => set('dob', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, dob: true }))} /></label>
                    <span className="field-hint">Private. Never exposed via ElevateMe ID.</span>
                    {touched.dob && errors.dob && <p role="alert" className="field-error">{errors.dob}</p>}</div>
                  <div className="field span-two"><label> Referee name / contact<input value={draft.referee} onChange={(e) => set('referee', e.target.value)} placeholder="Referee (optional for draft)" /></label>
                    <span className="field-hint">Verification only; hidden outside authorized staff.</span></div>
                </>
              )}
              {draft.role === 'coordinator' && (
                <div className="field"><label> Phone<input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Phone" autoComplete="tel" /></label></div>
              )}
              {draft.role === 'parent' && (
                <div className="notice span-two"><strong>Invitation required.</strong> Parent accounts link through a time-limited student-issued or admin-issued invitation — never open ID lookup.</div>
              )}
            </div>
          )}
          {step === 4 && (
            <div className="form-grid">
              <div className="field"><label> Profile photo<input type="file" accept="image/png,image/jpeg" aria-label="Profile photo" /></label>
                <span className="field-hint">JPG or PNG, max 5 MB. Preview only for now.</span></div>
              <div className="notice span-two"><strong>Verification.</strong> Students: referee details verify institute membership. Coordinators: institute email verifies employment. National ID is not requested.</div>
            </div>
          )}
          {step === 5 && (
            <div>
              <div className="form-grid" style={{ fontSize: '.9rem', marginBottom: 18 }}>
                <div><span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Role</span><br />{draft.role}</div>
                <div><span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Name</span><br />{draft.fullName || '—'}</div>
                <div><span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Email</span><br />{draft.email || '—'}</div>
                <div><span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Institute</span><br />{draft.institute || '—'}</div>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={draft.consent} onChange={(e) => set('consent', e.target.checked)} />
                <span>I accept the consent and privacy policy. I understand student records are sensitive and approvals are required.</span>
              </label>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
            <Button variant="secondary" disabled={step === 1 || busy} onClick={() => { setStep((s) => Math.max(1, s - 1)); setSubmitErrors([]); }}>Back</Button>
            {step < STEPS.length ? (
              step === 2 ? (
                <Button disabled={busy} onClick={handleStep2Continue}>{busy ? 'Creating login…' : 'Continue'}</Button>
              ) : (
                <Button onClick={() => {
                  const list = stepErrorList(step);
                  if (list.length > 0) { setSubmitErrors(list); setTouched({ fullName: true, email: true, password: true, institute: true, dob: true }); return; }
                  setSubmitErrors([]); setStep((s) => Math.min(STEPS.length, s + 1));
                }}>Continue</Button>
              )
            ) : (
              <Button disabled={busy} onClick={handleFinalSubmit}>{busy ? 'Submitting…' : 'Submit for approval'}</Button>
            )}
          </div>
          <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 14 }}>
            Already have an account? <Link to="/sign-in" className="link-quiet">Sign in</Link>
            <span> · </span><button type="button" className="link-quiet" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => navigate('/pending-approval')}>View pending approval</button>
          </p>
        </div>
      </section>
    </AuthHead>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const clean = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
      await supabase.auth.resetPasswordForEmail(clean, redirectTo ? { redirectTo } : undefined);
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthHead>
      <PageHead kicker="Account recovery" title="Forgot password." desc="Enter your account email. If it exists, a time-limited reset link is sent." />
      <section className="panel"><div className="panel-head"><h2>Request reset link</h2><span className="tag">Email link</span></div>
        <div className="panel-body">
          {sent ? (
            <div>
              <div className="notice" style={{ marginBottom: 18 }}>
                <strong>Check your inbox.</strong> If an account exists for {email.trim()}, a time-limited reset link has been sent.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link to="/sign-in" className="button secondary">Back to sign in</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: 'grid', gap: 18 }}>
              <div className="field"><label> Email<input type="email" required placeholder="you@example.edu" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
                {error && <p role="alert" className="field-error">{error}</p>}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
                <Link to="/sign-in" className="button secondary">Back to sign in</Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </AuthHead>
  );
}

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);
  const [linkState, setLinkState] = useState('checking');

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      const code = searchParams.get('code');
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!cancelled) setLinkState(error ? 'invalid' : 'ready');
        } else {
          if (!cancelled) setLinkState('ready');
        }
      } catch {
        if (!cancelled) setLinkState('invalid');
      }
    }
    verify();
    return () => { cancelled = true; };
  }, [searchParams]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const list = [];
    if (newPassword.length < 8) list.push('New password must be at least 8 characters.');
    if (newPassword !== confirm) list.push('Passwords do not match.');
    if (list.length > 0) {
      setFormError(list.join(' '));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setFormError(error.message || 'Could not reset your password. Request a new link and try again.');
        return;
      }
      setSuccess(true);
      setNewPassword('');
      setConfirm('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthHead>
      <PageHead kicker="Account recovery" title="Reset password." desc="Links expire. After reset, sign in again on all devices." />
      <section className="panel"><div className="panel-head"><h2>Choose a new password</h2><span className="tag">Secure</span></div>
        <div className="panel-body">
          {linkState === 'checking' && <p style={{ fontSize: '.9rem', color: 'var(--muted)' }}>Verifying reset link…</p>}
          {linkState === 'invalid' && (
            <div>
              <div className="notice" style={{ marginBottom: 18 }}>
                <strong>Link expired or invalid.</strong> Request a fresh reset link and try again.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link to="/forgot-password" className="button">Request new link</Link>
                <Link to="/sign-in" className="button secondary">Back to sign in</Link>
              </div>
            </div>
          )}
          {linkState !== 'checking' && linkState !== 'invalid' && success && (
            <div>
              <div className="notice" style={{ marginBottom: 18 }}>
                <strong>Password updated.</strong> Sign in with your new password.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button onClick={() => navigate('/sign-in')}>Back to sign in</Button>
              </div>
            </div>
          )}
          {linkState === 'ready' && !success && (
            <form onSubmit={onSubmit} style={{ display: 'grid', gap: 18 }}>
              <div className="field"><label> New password<input type="password" required placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
                <span className="field-hint">At least 8 characters.</span></div>
              <div className="field"><label> Confirm password<input type="password" required placeholder="Repeat password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label></div>
              {formError && <p role="alert" className="field-error">{formError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="submit" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</Button>
                <Link to="/sign-in" className="button secondary">Back to sign in</Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </AuthHead>
  );
}

export function CheckEmail() {
  const [searchParams] = useSearchParams();
  const [localEmail, setLocalEmail] = useState(() => searchParams.get('email') || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const onResend = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    const clean = localEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError('Enter a valid email address to resend.');
      return;
    }
    setBusy(true);
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: clean });
      if (resendError) {
        setError(resendError.message || 'Could not resend. Try again.');
        return;
      }
      setMessage(`Verification email resent to ${clean}. Check your inbox and spam folder.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthHead>
      <PageHead kicker="Verify your email" title="Check your email." desc="We sent a confirmation link. Confirm it before signing in." />
      <section className="panel"><div className="panel-head"><h2>Email verification</h2><span className="tag">Confirmation</span></div>
        <div className="panel-body">
          <div className="notice" style={{ marginBottom: 18 }}>
            <strong>Confirm your inbox{localEmail.trim() ? ` (${localEmail.trim()})` : ''}.</strong> Open the ElevateMe confirmation
            link to activate your login. Then wait for role approval on the pending approval page.
          </div>
          <form onSubmit={onResend} style={{ display: 'grid', gap: 18 }}>
            <div className="field"><label> Email<input type="email" required placeholder="you@example.edu" value={localEmail} onChange={(e) => setLocalEmail(e.target.value)} autoComplete="email" /></label>
              <span className="field-hint">Didn&apos;t get it? Check spam, then resend.</span>
              {error && <p role="alert" className="field-error">{error}</p>}
              {message && <p role="status" style={{ fontSize: '.88rem', color: 'var(--muted)' }}>{message}</p>}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button type="submit" disabled={busy}>{busy ? 'Resending…' : 'Resend verification email'}</Button>
              <Link to="/sign-in" className="button secondary">Back to sign in</Link>
              <Link to="/pending-approval" className="button secondary">Pending approval</Link>
            </div>
          </form>
        </div>
      </section>
    </AuthHead>
  );
}

export function PendingApproval() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wantsFix = searchParams.get('status') === 'changes' || searchParams.get('fix') === '1';
  const isChanges = session?.status === 'ChangesRequested' || wantsFix;

  const onSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <AuthHead>
      <PageHead kicker="Account created" title="Pending approval." desc="Your account is awaiting email verification and role approval." />
      <div className="notice" style={{ marginBottom: 22 }}>
        <strong>What happens next.</strong> Verify your email, then a Diplomatic Impact administrator reviews{' '}
        {session?.role || 'your'} access.
        You will be notified when your account is approved. Students receive an ElevateMe ID at that point.
      </div>
      {session?.email && (
        <p style={{ fontSize: '.88rem', color: 'var(--muted)', marginBottom: 18 }}>Signed in as {session.email}{session?.elevateMeId ? ` · ${session.elevateMeId}` : ''}.</p>
      )}
      {isChanges && (
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>Changes requested.</strong> An administrator needs corrections before approval.{' '}
          <Link to="/sign-up?fix=1" className="link-quiet">Review and resubmit your details →</Link>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to={`/check-email${session?.email ? `?email=${encodeURIComponent(session.email)}` : ''}`} className="button secondary">Verify email</Link>
        <Link to="/sign-in" className="button secondary">Back to sign in</Link>
        <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
      </div>
    </AuthHead>
  );
}

export function AccountRejected() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <AuthHead>
      <PageHead kicker="Account status" title="Account not approved." desc="This account was reviewed and not approved for ElevateMe access." />
      <div className="notice" style={{ marginBottom: 22 }}>
        <strong>What you can do.</strong> If you believe this is a mistake, contact a Diplomatic Impact administrator
        with your account email. You may also create a new request with corrected details.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/sign-up" className="button secondary">Create a new request</Link>
        <Link to="/" className="button secondary">Back home</Link>
        <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
      </div>
    </AuthHead>
  );
}

export function AccountSuspended() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <AuthHead>
      <PageHead kicker="Account status" title="Account suspended." desc="This account has been temporarily suspended and cannot access workspaces." />
      <div className="notice" style={{ marginBottom: 22 }}>
        <strong>What happens next.</strong> Contact a Diplomatic Impact administrator to review your account.
        Sign-in remains blocked until the suspension is lifted.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/" className="button secondary">Back home</Link>
        <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
      </div>
    </AuthHead>
  );
}
