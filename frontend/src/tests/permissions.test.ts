import { describe, expect, it } from 'vitest';
import { canAccess, navForSession } from '../lib/permissions';
import type { Session } from '../lib/auth';

function sessionFor(activeRole: Session['activeRole'], roles: Session['activeRole'][]): Session {
  return { userId: 'u1', email: 'a@e.edu', roles, activeRole, status: 'Approved' };
}

describe('permissions matrix — nav only, never grants backend access', () => {
  it('student/parent -> /app only', () => {
    const s = sessionFor('student', ['student']);
    expect(canAccess('/app', s)).toBe(true);
    expect(canAccess('/app/reports', s)).toBe(true);
    expect(canAccess('/staff/programs', s)).toBe(false);
    expect(canAccess('/admin/users', s)).toBe(false);
  });

  it('staff family -> /staff, not /admin', () => {
    const s = sessionFor('staff', ['staff']);
    expect(canAccess('/staff/programs', s)).toBe(true);
    expect(canAccess('/staff/comment-bank', s)).toBe(true);
    expect(canAccess('/admin/programs', s)).toBe(false);
    expect(canAccess('/app', s)).toBe(false);
  });

  it('admin -> /staff AND /admin', () => {
    const s = sessionFor('admin', ['admin']);
    expect(canAccess('/staff/programs', s)).toBe(true);
    expect(canAccess('/staff/programs/123', s)).toBe(true);
    expect(canAccess('/admin/programs', s)).toBe(true);
    expect(canAccess('/admin/users', s)).toBe(true);
  });

  it('pending accounts access nothing', () => {
    const s: Session = { userId: 'u1', email: 'a@e.edu', roles: ['staff'], activeRole: 'staff', status: 'PendingReview' };
    expect(canAccess('/staff/programs', s)).toBe(false);
    expect(canAccess('/app', s)).toBe(false);
  });

  it('signed-out users reach public only', () => {
    expect(canAccess('/programs', null)).toBe(true);
    expect(canAccess('/staff/programs', null)).toBe(false);
    expect(canAccess('/admin/outbox', null)).toBe(false);
  });

  it('nav has real links only (no dead ends)', () => {
    const admin = navForSession(sessionFor('admin', ['admin']));
    const all = admin.flatMap((s) => s.links.map((l) => l.to));
    expect(all).toContain('/staff/programs');
    expect(all).toContain('/admin/programs');
    expect(all).toContain('/admin/users');
    expect(all).toContain('/admin/comment-bank');
    const staff = navForSession(sessionFor('staff', ['staff']));
    const staffLinks = staff.flatMap((s) => s.links.map((l) => l.to));
    expect(staffLinks).toContain('/staff/programs');
    expect(staffLinks).not.toContain('/admin/users');
  });
});
