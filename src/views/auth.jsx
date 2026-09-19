import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorSummary, PageHead, Progress } from '../components/ui.jsx';
import { roleHome, useMockAuth } from '../lib/auth.jsx';

/* Engineered sign-in (kept): mock auth with role preview. */

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

export function SignIn() {
  const { switchRole } = useMockAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('student');

  return (
    <AuthHead>
      <PageHead kicker="Welcome back" title="Sign in." desc="Mock sign-in — real email verification and approvals ship with the backend." />
      <section className="panel"><div className="panel-head"><h2>Your account</h2><span className="tag">Mocked</span></div>
        <div className="panel-body">
          <form
            onSubmit={(e) => { e.preventDefault(); switchRole(role); navigate(roleHome(role)); }}
            style={{ display: 'grid', gap: 18 }}
          >
            <div className="field"><label> Email<input type="email" required placeholder="you@example.edu" defaultValue="nimuthu@example.com" /></label></div>
            <div className="field"><label> Password<input type="password" required placeholder="••••••••" defaultValue="password" /></label></div>
            <div className="field"><label> Preview as role<select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student</option><option value="parent">Parent</option>
              <option value="coordinator">Coordinator</option><option value="evaluator">Evaluator</option>
              <option value="admin">Admin</option>
            </select></label><span className="field-hint">Demo only — server role checks land with the backend.</span></div>
            <div><Button type="submit">Sign in</Button></div>
            <p style={{ fontSize: '.88rem' }}>
              <Link to="/forgot-password" className="link-quiet">Forgot password?</Link>
              <span style={{ color: 'var(--muted)' }}> · New here? </span>
              <Link to="/sign-up" className="link-quiet">Create an account</Link>
            </p>
            <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Pending, rejected, suspended, or changes-requested accounts see an explicit status screen after sign-in (mocked as Approved here).</p>
          </form>
        </div>
      </section>
    </AuthHead>
  );
}

/* Engineered 5-step create-account flow (kept): role → account → profile →
   photo/verification → review/consent, with per-step validation, error
   summary, session draft persistence and a pending-approval confirmation. */
const EMPTY = { role: 'student', fullName: '', email: '', password: '', institute: '', dob: '', referee: '', phone: '', consent: false };
const STEPS = ['Choose role', 'Account details', 'Profile information', 'Photo and verification', 'Review and submit'];

export function SignUp() {
  const { switchRole } = useMockAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(() => {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('em-signup-draft') : null;
      if (raw) return { ...EMPTY, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return EMPTY;
  });
  const [touched, setTouched] = useState({});
  const [submitErrors, setSubmitErrors] = useState([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem('em-signup-draft', JSON.stringify(draft)); } catch { /* ignore */ }
  }, [draft]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const errors = useMemo(() => {
    const e = {};
    if (!draft.fullName.trim()) e.fullName = 'Enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email)) e.email = 'Enter a valid email address.';
    if (draft.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if ((draft.role === 'student' || draft.role === 'coordinator') && !draft.institute.trim()) e.institute = 'Enter your institute.';
    if (draft.role === 'student' && !draft.dob) e.dob = 'Enter your date of birth.';
    return e;
  }, [draft]);

  const stepErrorList = (s) => {
    if (s === 2) return [errors.fullName, errors.email, errors.password].filter(Boolean);
    if (s === 3) return [errors.institute, errors.dob].filter(Boolean);
    if (s === 5) return [...Object.values(errors), ...(!draft.consent ? ['Accept consent and privacy to submit.'] : [])];
    return [];
  };

  if (done) {
    return (
      <AuthHead>
        <PageHead kicker="Account created" title="Pending approval." desc="Your account is awaiting email verification and role approval." />
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>What happens next.</strong> Verify your email, then a Diplomatic Impact administrator reviews {draft.role} access.
          You will be notified when your account is approved. Students receive an ElevateMe ID at that point.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={() => { const r = draft.role === 'coordinator' ? 'coordinator' : 'student'; switchRole(r); navigate(roleHome(r)); }}>
            Preview {draft.role} workspace
          </Button>
          <Button variant="secondary" onClick={() => { sessionStorage.removeItem('em-signup-draft'); setDraft(EMPTY); setStep(1); setDone(false); }}>Start over</Button>
        </div>
      </AuthHead>
    );
  }

  return (
    <AuthHead>
      <PageHead kicker="Create your account" title="Join ElevateMe." desc="Short steps instead of one long form. Drafts stay on this device during the session." />
      <Progress value={step} max={STEPS.length} label={STEPS[step - 1]} />
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
              <div className="field"><label> Full name<input value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, fullName: true }))} placeholder="Full name" /></label>
                {touched.fullName && errors.fullName && <p role="alert" className="field-error">{errors.fullName}</p>}</div>
              <div className="field"><label> Email<input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, email: true }))} placeholder="you@example.edu" /></label>
                {touched.email && errors.email && <p role="alert" className="field-error">{errors.email}</p>}</div>
              <div className="field span-two"><label> Password<input type="password" value={draft.password} onChange={(e) => set('password', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, password: true }))} placeholder="Choose a password" /></label>
                <span className="field-hint">At least 8 characters.</span>
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
                <div className="field"><label> Phone<input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Phone" /></label></div>
              )}
              {draft.role === 'parent' && (
                <div className="notice span-two"><strong>Invitation required.</strong> Parent accounts link through a time-limited student-issued or admin-issued invitation — never open ID lookup.</div>
              )}
            </div>
          )}
          {step === 4 && (
            <div className="form-grid">
              <div className="field"><label> Profile photo<input type="file" accept="image/png,image/jpeg" aria-label="Profile photo" /></label>
                <span className="field-hint">JPG or PNG, max 5 MB. Preview only in this mock.</span></div>
              <div className="notice span-two"><strong>Verification.</strong> Students: referee details verify institute membership. Coordinators: institute email verifies employment. National ID is not requested in this mock.</div>
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
            <Button variant="secondary" disabled={step === 1} onClick={() => { setStep((s) => Math.max(1, s - 1)); setSubmitErrors([]); }}>Back</Button>
            {step < STEPS.length ? (
              <Button onClick={() => {
                const list = stepErrorList(step);
                if (list.length > 0) { setSubmitErrors(list); setTouched({ fullName: true, email: true, password: true, institute: true, dob: true }); return; }
                setSubmitErrors([]); setStep((s) => Math.min(STEPS.length, s + 1));
              }}>Continue</Button>
            ) : (
              <Button onClick={() => {
                const list = stepErrorList(5);
                if (list.length > 0) { setSubmitErrors(list); return; }
                setSubmitErrors([]); setDone(true);
              }}>Submit for approval</Button>
            )}
          </div>
        </div>
      </section>
    </AuthHead>
  );
}

export function ForgotPassword() {
  return (
    <AuthHead>
      <PageHead kicker="Account recovery" title="Forgot password." desc="Enter your account email. If it exists, a time-limited reset link is sent." />
      <section className="panel"><div className="panel-head"><h2>Request reset link</h2><span className="tag">Mock</span></div>
        <div className="panel-body">
          <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gap: 18 }}>
            <div className="field"><label> Email<input type="email" required placeholder="you@example.edu" /></label></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit">Send reset link</Button>
              <Link to="/sign-in" className="button secondary">Back to sign in</Link>
            </div>
          </form>
        </div>
      </section>
    </AuthHead>
  );
}

export function ResetPassword() {
  return (
    <AuthHead>
      <PageHead kicker="Account recovery" title="Reset password." desc="Links expire. After reset, sign in again on all devices." />
      <section className="panel"><div className="panel-head"><h2>Choose a new password</h2><span className="tag">Mock</span></div>
        <div className="panel-body">
          <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gap: 18 }}>
            <div className="field"><label> New password<input type="password" required placeholder="New password" /></label>
              <span className="field-hint">At least 8 characters.</span></div>
            <div className="field"><label> Confirm password<input type="password" required placeholder="Repeat password" /></label></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit">Reset password</Button>
              <Link to="/sign-in" className="button secondary">Back to sign in</Link>
            </div>
          </form>
        </div>
      </section>
    </AuthHead>
  );
}
