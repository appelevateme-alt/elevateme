import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { PublicHeader } from '../../components/PublicHeader';
import { AvatarEditor } from '../../components/AvatarEditor';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import styles from './SignUpPage.module.css';

export type SignUpRole = 'student' | 'teacher';

/** Backend role vocab: teacher UI maps to coordinator (staff family). */
export function backendRoleFor(role: SignUpRole): string {
  return role === 'teacher' ? 'coordinator' : 'student';
}

export interface SignUpDraft {
  role: SignUpRole | '';
  fullName: string;
  email: string;
  password: string;
  dob: string;
  institute: string;
  phone: string;
  referee: string;
  consent: boolean;
}

export function validateSignUp(d: SignUpDraft): string[] {
  const list: string[] = [];
  if (!d.role) list.push('Choose your role to continue.');
  if (!d.fullName.trim()) list.push('Enter your full name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) list.push('Enter a valid email address.');
  if (d.password.length < 8) list.push('Password must be at least 8 characters.');
  if (!d.institute.trim()) list.push('Enter your institute.');
  if (d.role === 'student' && !d.dob) list.push('Enter your date of birth.');
  if (d.dob && Number.isNaN(Date.parse(d.dob))) list.push('Enter a valid birth date.');
  if (!d.consent) list.push('Accept consent and privacy to submit.');
  return list;
}

/**
 * /sign-up — role select (student/teacher) + account + profile fields
 * per spec §4: full name, email, password, birth date, institute, phone,
 * photo, referee contact w/ purpose note, consent checkbox.
 * Photo upload via AvatarEditor; email verification notice -> /verify-email.
 * Inputs preserved on error; focusable error summary.
 */
export function SignUpPage() {
  const { session } = useAuth();
  const [role, setRole] = useState<SignUpRole | ''>('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [institute, setInstitute] = useState('');
  const [phone, setPhone] = useState('');
  const [referee, setReferee] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  // Pre-auth photo: hold the selected file locally via AvatarEditor deferral.
  // AvatarEditor never calls the photo API without a session (no 401); it
  // holds pendingFile and uploads once a session exists, showing
  // "Photo will upload after sign-in.".
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function focusSummary() {
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const draft: SignUpDraft = { role, fullName, email, password, dob, institute, phone, referee, consent };
    const list = validateSignUp(draft);
    if (list.length > 0) {
      setErrors(list);
      focusSummary();
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const cleanEmail = email.trim();
      const backendRole = backendRoleFor(role as SignUpRole);
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/verify-email?email=${encodeURIComponent(cleanEmail)}`
          : undefined;
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            roles: [backendRole],
            requested_role: backendRole,
            institute: institute.trim(),
            dob: dob || null,
            phone: phone.trim() || null,
            referee: referee.trim() || null,
            photo_url: photoUrl || null,
          },
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate') || msg.includes('already in use')) {
          setErrors(['An account with this email already exists. Try signing in or resetting your password.']);
        } else {
          setErrors([error.message || 'Could not create your account. Try again.']);
        }
        focusSummary();
        return;
      }
      // Success: keep profile inputs (never clear on failure); show verification notice.
      setCreatedEmail(cleanEmail);
    } finally {
      setBusy(false);
    }
  }

  if (createdEmail) {
    return (
      <>
        <PublicHeader />
        <main className={styles.page} data-testid="page-sign-up">
          <PageHeading kicker="Account created" title="Check your email" desc="We sent a confirmation link. Confirm it before signing in." />
          <div className={styles.notice} role="status">
            <p>
              <strong>Verify {createdEmail}.</strong> Open the confirmation link, then sign in. A reviewer approves
              access after verification.
            </p>
          </div>
          <div className={styles.actions}>
            <Link to={`/verify-email?email=${encodeURIComponent(createdEmail)}`}>Go to email verification</Link>
            <Link to="/sign-in">Go to sign in</Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PublicHeader />
      <main className={styles.page} data-testid="page-sign-up">
        <PageHeading kicker="Create your account" title="Sign up" desc="Choose a role, then add account and profile details." />
        {errors.length > 0 && (
          <div ref={summaryRef} role="alert" tabIndex={-1} className={styles.error} data-testid="sign-up-errors">
            <ul>
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.field}>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as SignUpRole | '')} aria-label="Role">
              <option value="">Choose your role…</option>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </label>
          <label className={styles.field}>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" aria-label="Full name" placeholder="Full name" />
          </label>
          <label className={styles.field}>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="Email" placeholder="you@example.edu" />
          </label>
          <label className={styles.field}>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-label="Password" placeholder="At least 8 characters" />
            <span className={styles.hint}>At least 8 characters.</span>
          </label>
          <label className={styles.field}>
            Birth date{role === 'student' ? ' (required)' : ''}
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} aria-label="Birth date" />
            <span className={styles.hint}>Private. Never exposed via ElevateMe ID.</span>
          </label>
          <label className={styles.field}>
            Institute
            <input value={institute} onChange={(e) => setInstitute(e.target.value)} aria-label="Institute" placeholder="Institute" />
          </label>
          <label className={styles.field}>
            Phone (optional)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" aria-label="Phone" placeholder="Phone" />
          </label>
          <label className={styles.field}>
            Referee name / contact (optional)
            <input value={referee} onChange={(e) => setReferee(e.target.value)} aria-label="Referee contact" placeholder="Referee contact" />
            <span className={styles.hint}>Verification only; hidden outside authorized staff.</span>
          </label>
          <div className={styles.photo}>
            <span className={styles.photoLabel}>Photo (optional)</span>
            <AvatarEditor
              name={fullName || email || 'New member'}
              photoUrl={photoUrl || undefined}
              onUploaded={setPhotoUrl}
              deferUpload={!session}
              onPendingFile={setPendingFile}
            />
            <span className={styles.hint}>JPG, PNG or WebP up to 5MB. Uploads when signed in; otherwise saved after verification.</span>
            {/* pendingFile is held locally while signed out; AvatarEditor shows "Photo will upload after sign-in." and uploads once a session exists. */}
            <span hidden data-testid="signup-pending-held">{pendingFile ? 'held' : ''}</span>
          </div>
          <label className={styles.consent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-label="Consent" />
            <span>I accept the consent and privacy policy. I understand records are sensitive and approvals are required.</span>
          </label>
          <div className={styles.actions}>
            <button type="submit" disabled={busy} className={styles.primary}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
            <Link to="/sign-in">Already have an account? Sign in</Link>
          </div>
        </form>
      </main>
    </>
  );
}
