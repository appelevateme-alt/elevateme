import { describe, expect, it } from 'vitest';
import { ApiError, toErrorState } from '../lib/api';
import { canPerformStaffAction, normalizeViewPref, viewModeHeader } from '../lib/viewMode';

function apiError(status: number, code: string) {
  return new ApiError(status, { code, message: code });
}

describe('isolation Phase 1c', () => {
  it('ViewSwitcher never grants staff rights (presentation-only)', () => {
    // Student/parent views cannot escalate to staff regardless of preference.
    expect(canPerformStaffAction('student', ['student'])).toBe(false);
    expect(canPerformStaffAction('parent', ['parent'])).toBe(false);
    expect(canPerformStaffAction('parent', ['student', 'parent'])).toBe(false);
    // Staff rights come from DB roles only, never the view toggle.
    expect(canPerformStaffAction('student', ['coordinator'])).toBe(true);
    expect(canPerformStaffAction('parent', ['admin'])).toBe(true);
  });

  it('view pref normalizes + header is informational (X-View-Mode)', () => {
    expect(normalizeViewPref('parent')).toBe('parent');
    expect(normalizeViewPref('student')).toBe('student');
    expect(normalizeViewPref('admin')).toBe('student');
    expect(normalizeViewPref(null)).toBe('student');
    expect(viewModeHeader('parent')).toEqual({ 'X-View-Mode': 'parent' });
    expect(viewModeHeader('student')).toEqual({ 'X-View-Mode': 'student' });
  });

  it('error mapping 401 => re-auth, 403 => denied, 404 => notfound', () => {
    expect(toErrorState(401, 'UNAUTHENTICATED')).toBe('reauth');
    expect(toErrorStateFromTest(401, 'UNAUTHENTICATED')).toBe('reauth');
    expect(toErrorState(403, 'FORBIDDEN')).toBe('denied');
    expect(toErrorState(403, 'ACCOUNT_PENDING')).toBe('pending');
    expect(toErrorState(404, 'NOT_FOUND')).toBe('notfound');
    expect(toErrorState(422, 'VALIDATION')).toBe('other');
  });

  it('ApiError preserves status/code for router states', () => {
    expect(apiError(401, 'UNAUTHENTICATED').status).toBe(401);
    expect(apiError(403, 'ACCOUNT_PENDING').code).toBe('ACCOUNT_PENDING');
    expect(apiError(404, 'NOT_FOUND').status).toBe(404);
  });
});

function toErrorStateFromTest(status: number, code: string) {
  return toErrorState(status, code);
}
