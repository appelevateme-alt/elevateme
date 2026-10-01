import { describe, expect, it } from 'vitest';
import {
  FORGOT_PASSWORD_SENT_COPY,
  buildResetRedirect,
  validateForgotPasswordEmail,
} from '../pages/auth/ForgotPasswordPage';
import {
  RESET_LINK_INVALID_COPY,
  RESET_PASSWORD_UPDATED_COPY,
  getRecoveryCodeFromLocation,
  getRecoveryErrorFromLocation,
  hasRecoverySessionHint,
  isExpiredOrInvalidMessage,
  validateResetPassword,
} from '../pages/auth/ResetPasswordPage';

describe('password recovery — forgot-password validation + generic copy', () => {
  it('rejects invalid emails, accepts valid emails', () => {
    expect(validateForgotPasswordEmail('')).toMatch(/valid email/i);
    expect(validateForgotPasswordEmail('bad')).toMatch(/valid email/i);
    expect(validateForgotPasswordEmail('a@b')).toMatch(/valid email/i);
    expect(validateForgotPasswordEmail('a@example.edu')).toBeNull();
    expect(validateForgotPasswordEmail('  a@example.edu  ')).toBeNull();
  });

  it('generic sent copy avoids account enumeration (success and error)', () => {
    expect(FORGOT_PASSWORD_SENT_COPY).toBe('If an account exists, a reset link has been sent');
  });

  it('reset redirect targets origin + /reset-password', () => {
    expect(buildResetRedirect('https://app.example.edu')).toBe('https://app.example.edu/reset-password');
    expect(buildResetRedirect('https://app.example.edu/')).toBe('https://app.example.edu/reset-password');
    expect(buildResetRedirect('http://localhost:5173')).toBe('http://localhost:5173/reset-password');
  });
});

describe('password recovery — reset-password validation', () => {
  it('requires min 8 chars', () => {
    expect(validateResetPassword('short', 'short').join(' ')).toMatch(/8 characters/);
    expect(validateResetPassword('', '').join(' ')).toMatch(/8 characters/);
  });

  it('requires password and confirm to match', () => {
    expect(validateResetPassword('password1', 'password2')).toContain('Passwords do not match.');
    expect(validateResetPassword('password1', 'password1')).toEqual([]);
  });

  it('reports both errors at once', () => {
    const errs = validateResetPassword('short', 'other');
    expect(errs.join(' ')).toMatch(/8 characters/);
    expect(errs.join(' ')).toMatch(/do not match/);
  });

  it('success copy is "Password updated"', () => {
    expect(RESET_PASSWORD_UPDATED_COPY).toBe('Password updated');
  });

  it('invalid link copy directs to a new link', () => {
    expect(RESET_LINK_INVALID_COPY).toMatch(/expired or invalid/i);
    expect(RESET_LINK_INVALID_COPY).toMatch(/new link/i);
  });
});

describe('password recovery — recovery code/hash parsing', () => {
  it('reads ?code= from query or hash', () => {
    expect(getRecoveryCodeFromLocation('?code=abc123', '')).toBe('abc123');
    expect(getRecoveryCodeFromLocation('', '#code=abc123')).toBe('abc123');
    expect(getRecoveryCodeFromLocation('?token_hash=tok', '')).toBe('tok');
    expect(getRecoveryCodeFromLocation('', '')).toBeNull();
  });

  it('detects hash-flow session hints', () => {
    expect(hasRecoverySessionHint('', '#access_token=tok&type=recovery')).toBe(true);
    expect(hasRecoverySessionHint('?type=recovery', '')).toBe(true);
    expect(hasRecoverySessionHint('', '')).toBe(false);
  });

  it('detects recovery errors (expired/invalid)', () => {
    expect(getRecoveryErrorFromLocation('?error=access_denied&error_description=Expired', '')).toMatch(
      /expired/i,
    );
    expect(getRecoveryErrorFromLocation('', '#error_code=otp_expired&error_description=Email+link+is+invalid')).toBeTruthy();
    expect(getRecoveryErrorFromLocation('', '')).toBeNull();
  });

  it('classifies expired/invalid updateUser errors', () => {
    expect(isExpiredOrInvalidMessage('Token expired')).toBe(true);
    expect(isExpiredOrInvalidMessage('Auth session missing!')).toBe(true);
    expect(isExpiredOrInvalidMessage('otp expired')).toBe(true);
    expect(isExpiredOrInvalidMessage('Something else broke')).toBe(false);
  });
});
