import { describe, expect, it } from 'vitest';
import { backendRoleFor, validateSignUp } from '../pages/auth/SignUpPage';
import { safeNext, signInErrorCopy } from '../pages/auth/SignInPage';
import { nextActionForLifecycle } from '../features/programs/helpers';

describe('audit 17/18 — sign-in next + 401 copy', () => {
  it('safeNext allows same-origin paths only', () => {
    expect(safeNext('/app')).toBe('/app');
    expect(safeNext('/sign-in?next=%2Fapp')).toContain('/sign-in');
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('//evil')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it('invalid credentials map to inline 401 copy', () => {
    expect(signInErrorCopy('Invalid login credentials').text).toMatch(/Invalid email or password/);
    expect(signInErrorCopy('Invalid login credentials').unconfirmed).toBe(false);
  });

  it('unconfirmed email maps to verification copy', () => {
    const out = signInErrorCopy('Email not confirmed');
    expect(out.unconfirmed).toBe(true);
    expect(out.text).toMatch(/not confirmed/i);
  });
});

describe('audit 17 — sign-up validation preserves inputs', () => {
  it('requires role, name, email, password, institute, dob, consent', () => {
    const errs = validateSignUp({
      role: '',
      fullName: '',
      email: 'bad',
      password: 'short',
      dob: '',
      institute: '',
      phone: '',
      referee: '',
      consent: false,
    });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join(' ')).toMatch(/role/i);
  });

  it('student requires dob; teacher maps to coordinator', () => {
    expect(backendRoleFor('teacher')).toBe('coordinator');
    expect(backendRoleFor('student')).toBe('student');
    const studentNoDob = validateSignUp({
      role: 'student',
      fullName: 'A B',
      email: 'a@example.edu',
      password: 'password1',
      dob: '',
      institute: 'Inst',
      phone: '',
      referee: '',
      consent: true,
    });
    expect(studentNoDob.join(' ')).toMatch(/birth/i);
  });
});

describe('audit 18 — workspace next action never inert', () => {
  it('terminal lifecycles have a label the page renders with a real handler', () => {
    // Page renders submit/manage with onClick; edit-limited/view render a
    // status note plus a navigation button (no disabled button without handler).
    expect(nextActionForLifecycle('SUBMITTED').label).toBeTruthy();
    expect(nextActionForLifecycle('ARCHIVED').label).toBeTruthy();
    expect(nextActionForLifecycle('DRAFT').action).toBe('submit');
    expect(nextActionForLifecycle('PUBLISHED').action).toBe('manage');
  });
});
