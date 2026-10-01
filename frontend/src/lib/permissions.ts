import type { Role, Session } from './auth';

/**
 * Permission matrix (code-enforceable, mirrors docs/PERMISSIONS.md nav matrix).
 *
 * - student / parent -> /app/* only (shared-account: one profile, parent view is
 *   presentation-only, never grants staff rights).
 * - teacher family (staff / coordinator / evaluator) -> /staff/* (own programs +
 *   assigned sessions only; writes still checked server-side).
 * - admin -> /staff/* AND /admin/* (admin bypasses staff ownership for
 *   management reads; every write is still checked + audited server-side).
 *
 * This module is nav-only. It never grants backend access — the backend
 * (ScopeGuard + RLS + RPC) is authoritative and already enforced.
 */

export type StaffRole = 'staff' | 'coordinator' | 'evaluator';

export const STAFF_ROLES: Role[] = ['staff', 'coordinator', 'evaluator'];
export const STAFF_AND_ADMIN_ROLES: Role[] = ['staff', 'coordinator', 'evaluator', 'admin'];
export const ADMIN_ONLY_ROLES: Role[] = ['admin'];
export const STUDENT_ROLES: Role[] = ['student', 'parent'];

function cleanPath(path: string): string {
  return path.split('?')[0].split('#')[0] || '/';
}

/**
 * canAccess(path, session): pure nav check.
 * - Null session => only public routes (/, /programs, /sign-in, ...).
 * - Status-gated accounts (PendingReview/Rejected/Suspended) may only visit
 *   their account gate + public pages — never /app, /staff, /admin content.
 */
export function canAccess(path: string, session: Session | null): boolean {
  const clean = cleanPath(path);
  if (!session) {
    return !(
      clean.startsWith('/app') ||
      clean.startsWith('/staff') ||
      clean.startsWith('/admin') ||
      clean.startsWith('/evaluate/session') ||
      clean.startsWith('/evaluate/students')
    );
  }
  if (session.status === 'PendingReview' || session.status === 'Rejected' || session.status === 'Suspended') {
    return false;
  }
  const roles = session.roles;
  if (clean.startsWith('/admin')) {
    return roles.includes('admin');
  }
  if (clean.startsWith('/staff')) {
    return (
      roles.includes('staff') ||
      roles.includes('coordinator') ||
      roles.includes('evaluator') ||
      roles.includes('admin')
    );
  }
  if (clean.startsWith('/evaluate/session') || clean.startsWith('/evaluate/students')) {
    return (
      roles.includes('staff') ||
      roles.includes('coordinator') ||
      roles.includes('evaluator') ||
      roles.includes('admin')
    );
  }
  if (clean.startsWith('/app')) {
    return roles.includes('student') || roles.includes('parent') || roles.includes('admin');
  }
  return true;
}

/** Nav sections for AppShell: real links only, no dead ends. */
export interface NavLink {
  to: string;
  label: string;
  /** Non-MVP secondary page: shown with a "Deferred" badge + docs hint, never a dead link. */
  deferred?: boolean;
}

export function navForSession(session: Session | null): { section: string; links: NavLink[] }[] {
  if (!session) return [];
  const roles = session.roles;
  const sections: { section: string; links: NavLink[] }[] = [];
  if (roles.includes('student') || roles.includes('parent') || roles.includes('admin')) {
    sections.push({
      section: 'My learning',
      links: [
        { to: '/app', label: 'Home' },
        { to: '/app/programs', label: 'My programs' },
        { to: '/app/performance', label: 'Performance' },
        { to: '/app/reports', label: 'Reports' },
        { to: '/app/recommendations', label: 'Recommendations' },
        { to: '/app/development', label: 'Development' },
        { to: '/app/queries', label: 'Queries' },
        { to: '/app/profile', label: 'Profile', deferred: true },
      ],
    });
  }
  if (
    roles.includes('staff') ||
    roles.includes('coordinator') ||
    roles.includes('evaluator') ||
    roles.includes('admin')
  ) {
    sections.push({
      section: 'Staff workspace',
      links: [
        { to: '/staff/programs', label: 'Programs' },
        { to: '/staff/programs/new', label: 'New program' },
        { to: '/staff/comment-bank', label: 'Comment bank' },
      ],
    });
  }
  if (roles.includes('admin')) {
    sections.push({
      section: 'Administration',
      links: [
        { to: '/admin', label: 'Overview' },
        { to: '/admin/programs', label: 'Program review' },
        { to: '/admin/users', label: 'Account review' },
        { to: '/admin/approvals', label: 'Approvals', deferred: true },
        { to: '/admin/recommendations', label: 'Recommendations' },
        { to: '/admin/development', label: 'Development' },
        { to: '/admin/payments', label: 'Payments' },
        { to: '/admin/queries', label: 'Queries' },
        { to: '/admin/outbox', label: 'Outbox' },
        { to: '/admin/comment-bank', label: 'Shared snippets' },
        { to: '/admin/evaluations', label: 'Evaluations', deferred: true },
        { to: '/admin/notifications', label: 'Notifications' },
        { to: '/admin/audit', label: 'Audit', deferred: true },
      ],
    });
  }
  return sections;
}

/** Human-friendly role label for empty states (plain language, no jargon). */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'student':
      return 'Student';
    case 'parent':
      return 'Parent';
    case 'staff':
      return 'Teacher';
    case 'coordinator':
      return 'Coordinator';
    case 'evaluator':
      return 'Evaluator';
    case 'admin':
      return 'Administrator';
  }
}
