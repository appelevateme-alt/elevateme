/**
 * View-mode preference (Phase 1c).
 *
 * Presentation-only: Student view / Parent view changes layout density only.
 * It NEVER changes permissions — authorization is enforced server-side by
 * ScopeGuard using DB roles; the X-View-Mode header / PATCH /me preference
 * is informational and ignored for access decisions.
 */

export type ViewPref = 'student' | 'parent';

export const VIEW_PREF_KEY = 'em:view-preference';

export function normalizeViewPref(v: unknown): ViewPref {
  return v === 'parent' ? 'parent' : 'student';
}

export function viewModeHeader(view: ViewPref): Record<string, string> {
  return { 'X-View-Mode': view };
}

/**
 * Pure permission check for tests: view preference must never grant staff rights.
 * Returns false for any staff-only action regardless of view.
 */
export function canPerformStaffAction(view: ViewPref, roles: string[]): boolean {
  void view; // view is intentionally irrelevant to authorization
  return roles.includes('admin')
    || roles.includes('staff')
    || roles.includes('coordinator')
    || roles.includes('evaluator');
}
