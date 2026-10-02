/**
 * Shared E2E skeleton helpers — Phase 5 scenarios 1-14.
 * Synthetic data only. Never real emails, never prod.
 * Tests self-skip unless E2E_LIVE=1 or E2E_BASE_URL is set (CI unit stays green).
 */

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? '';
export const E2E_API_URL =
  process.env.E2E_API_URL ?? (E2E_BASE_URL ? `${E2E_BASE_URL.replace(/\/$/, '')}/api` : '');

/** True only when the operator explicitly opted into a live E2E stack. */
export const E2E_ENABLED = Boolean(process.env.E2E_BASE_URL || process.env.E2E_LIVE === '1');

/** Synthetic inbox-style address. Example: test+e2e-1700000000000-a1b2@example.com */
export function syntheticEmail(prefix: string): string {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `test+${prefix}-${stamp}-${rand}@example.com`;
}

/** Join the (possibly empty) E2E base with a path; falls back to relative for webServer mode. */
export function e2eUrl(path: string): string {
  if (!path.startsWith('/')) return `${E2E_BASE_URL}/${path}`;
  return E2E_BASE_URL ? `${E2E_BASE_URL.replace(/\/$/, '')}${path}` : path;
}

export const SKIP_REASON =
  'E2E env not set (E2E_LIVE=1 or E2E_BASE_URL/E2E_API_URL) — skeleton only, CI unit stays green.';
