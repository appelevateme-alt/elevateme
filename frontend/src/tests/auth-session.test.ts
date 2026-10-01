import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api';
import {
  accountStatusTarget,
  authEventAction,
  buildSession,
  dashboardForRoles,
  isUnauthorizedError,
  resolvePostSignInTarget,
  roleAllowsPath,
  rolesFromMe,
  shouldApplyResolve,
  type Session,
} from '../lib/auth';
import { canPerformStaffAction } from '../lib/viewMode';

function sessionFor(activeRole: Session['activeRole'], roles: Session['roles'], status: Session['status'] = 'Approved'): Session {
  return { userId: 'u-1', email: 'a@example.edu', roles, activeRole, status };
}

describe('Phase 1A auth-session — resolve on SIGNED_IN', () => {
  it('SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION with user resolve', () => {
    expect(authEventAction('SIGNED_IN', true)).toBe('resolve');
    expect(authEventAction('TOKEN_REFRESHED', true)).toBe('resolve');
    expect(authEventAction('USER_UPDATED', true)).toBe('resolve');
    expect(authEventAction('INITIAL_SESSION', true)).toBe('resolve');
  });

  it('SIGNED_OUT or missing user clears (never resolves stale)', () => {
    expect(authEventAction('SIGNED_OUT', true)).toBe('clear');
    expect(authEventAction('SIGNED_OUT', false)).toBe('clear');
    expect(authEventAction('SIGNED_IN', false)).toBe('clear');
    expect(authEventAction('TOKEN_REFRESHED', false)).toBe('clear');
  });
});

describe('Phase 1A auth-session — stale responses ignored', () => {
  it('ignores when a newer request started (requestId guard)', () => {
    expect(shouldApplyResolve(1, 2, 'user-a', 'user-a')).toBe(false);
    expect(shouldApplyResolve(2, 2, 'user-a', 'user-a')).toBe(true);
  });

  it('ignores when the account changed mid-flight', () => {
    expect(shouldApplyResolve(2, 2, 'user-a', 'user-b')).toBe(false);
    expect(shouldApplyResolve(2, 2, null, 'user-b')).toBe(false);
  });

  it('stale resolve must not overwrite a newer session', () => {
    // Simulate: request 1 (user-a, slow) vs request 2 (user-b, fast).
    let applied: Session | null = null;
    const latest = 2;
    const currentUserId: string | null = 'user-b';
    const stale: Session = sessionFor('student', ['student']);
    if (shouldApplyResolve(1, latest, 'user-a', currentUserId)) applied = stale;
    expect(applied).toBeNull();
    const fresh: Session = sessionFor('staff', ['staff']);
    if (shouldApplyResolve(2, latest, 'user-b', currentUserId)) applied = fresh;
    expect(applied?.activeRole).toBe('staff');
  });
});

describe('Phase 1A auth-session — logout clears cache', () => {
  it('SIGNED_OUT maps to clear so the provider clears session + query cache', () => {
    expect(authEventAction('SIGNED_OUT', false)).toBe('clear');
    expect(authEventAction('SIGNED_OUT', true)).toBe('clear');
  });

  it('QueryClient.clear() empties cached queries (logout hygiene)', () => {
    const qc = new QueryClient();
    const clear = vi.spyOn(qc, 'clear');
    qc.setQueryData(['me'], { id: 'u-1' });
    expect(qc.getQueryData(['me'])).toBeDefined();
    qc.clear();
    expect(clear).toHaveBeenCalled();
    expect(qc.getQueryData(['me'])).toBeUndefined();
  });
});

describe('Phase 1A auth-session — role dashboard mapping', () => {
  it('admin -> /admin', () => {
    expect(dashboardForRoles(['admin'])).toBe('/admin');
    expect(dashboardForRoles(['student', 'admin'])).toBe('/admin');
  });

  it('staff / coordinator / evaluator -> /staff', () => {
    expect(dashboardForRoles(['staff'])).toBe('/staff');
    expect(dashboardForRoles(['coordinator'])).toBe('/staff');
    expect(dashboardForRoles(['evaluator'])).toBe('/staff');
    expect(dashboardForRoles(['student', 'staff'])).toBe('/staff');
  });

  it('student / parent -> /app', () => {
    expect(dashboardForRoles(['student'])).toBe('/app');
    expect(dashboardForRoles(['parent'])).toBe('/app');
  });

  it('preserves ?next= when the role permits it, else role dashboard', () => {
    const student = sessionFor('student', ['student']);
    expect(resolvePostSignInTarget(student, '/app/performance')).toBe('/app/performance');
    expect(resolvePostSignInTarget(student, '/admin')).toBe('/app');

    const staff = sessionFor('staff', ['staff']);
    expect(resolvePostSignInTarget(staff, '/staff/programs/new')).toBe('/staff/programs/new');
    expect(resolvePostSignInTarget(staff, '/app')).toBe('/staff');

    const admin = sessionFor('admin', ['admin']);
    expect(resolvePostSignInTarget(admin, '/staff/programs/new')).toBe('/staff/programs/new');
    expect(resolvePostSignInTarget(admin, null)).toBe('/admin');

    expect(roleAllowsPath(['student'], '/app')).toBe(true);
    expect(roleAllowsPath(['student'], '/admin')).toBe(false);
    expect(roleAllowsPath(['staff'], '/staff/programs/new')).toBe(true);
    expect(roleAllowsPath(['staff'], '/app')).toBe(false);
  });

  it('rejects unsafe next values', () => {
    const student = sessionFor('student', ['student']);
    expect(resolvePostSignInTarget(student, 'https://evil.example')).toBe('/app');
    expect(resolvePostSignInTarget(student, '//evil')).toBe('/app');
  });
});

describe('Phase 1A auth-session — pending / rejected / suspended states', () => {
  it('maps statuses to account gates', () => {
    expect(accountStatusTarget('PendingReview')).toBe('/account/pending');
    expect(accountStatusTarget('Rejected')).toBe('/account/rejected');
    expect(accountStatusTarget('Suspended')).toBe('/account/suspended');
    expect(accountStatusTarget('Approved')).toBeNull();
    expect(accountStatusTarget('ChangesRequested')).toBeNull();
  });

  it('status gate wins over ?next= and dashboard', () => {
    expect(resolvePostSignInTarget(sessionFor('student', ['student'], 'PendingReview'), '/app')).toBe(
      '/account/pending',
    );
    expect(resolvePostSignInTarget(sessionFor('staff', ['staff'], 'Rejected'), '/staff')).toBe(
      '/account/rejected',
    );
    expect(resolvePostSignInTarget(sessionFor('admin', ['admin'], 'Suspended'), '/admin')).toBe(
      '/account/suspended',
    );
  });
});

describe('Phase 1A auth-session — /me failure vs 401', () => {
  it('401 invalid => signed-out (no retry), network => retry', () => {
    expect(isUnauthorizedError(new ApiError(401, { code: 'UNAUTHENTICATED', message: 'x' }))).toBe(true);
    expect(isUnauthorizedError(new ApiError(500, { code: 'UNKNOWN', message: 'x' }))).toBe(false);
    expect(isUnauthorizedError(new ApiError(403, { code: 'FORBIDDEN', message: 'x' }))).toBe(false);
    expect(isUnauthorizedError(new Error('Failed to fetch'))).toBe(false);
  });
});

describe('Phase 1A auth-session — roles/status DB-only', () => {
  it('rolesFromMe prefers roles[], falls back to legacy role, then student', () => {
    expect(rolesFromMe({ id: '1', email: 'a@e.edu', roles: ['staff', 'admin'] })).toEqual(['staff', 'admin']);
    expect(rolesFromMe({ id: '1', email: 'a@e.edu', role: 'admin' })).toEqual(['admin']);
    expect(rolesFromMe({ id: '1', email: 'a@e.edu' })).toEqual(['student']);
  });

  it('buildSession preserves active role only when still granted', () => {
    const kept = buildSession({ id: '1', email: 'a@e.edu', roles: ['student', 'staff'] }, 'staff');
    expect(kept.activeRole).toBe('staff');
    const reset = buildSession({ id: '1', email: 'a@e.edu', roles: ['student'] }, 'admin');
    expect(reset.activeRole).toBe('student');
    expect(reset.status).toBe('Approved');
  });
});

describe('Phase 1A auth-session — ViewSwitcher never grants permissions', () => {
  it('view preference cannot escalate to staff', () => {
    expect(canPerformStaffAction('student', ['student'])).toBe(false);
    expect(canPerformStaffAction('parent', ['parent'])).toBe(false);
    expect(canPerformStaffAction('parent', ['student', 'parent'])).toBe(false);
    expect(canPerformStaffAction('student', ['coordinator'])).toBe(true);
    expect(canPerformStaffAction('parent', ['admin'])).toBe(true);
  });
});
