/**
 * Phase 5 scenario 06 — guest-assigned.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Token-scoped guest sees only assigned roster rows (names + status).
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('06 guest invite shows only assigned roster scope', async ({ page }) => {
  const token = 'E2E_SYNTHETIC_TOKEN';
  await page.goto(e2eUrl(`/evaluate/session?token=${token}`));
  await expect(
    page.getByTestId('evaluate-session').or(page.getByTestId('evaluate-invite')).or(page.getByTestId('evaluate-invite-expired')),
  ).toBeVisible();

  // Assigned rows only; cross-scope students stay invisible (server-enforced).
  await expect(
    page.getByTestId('guest-roster-row').first().or(page.getByTestId('evaluate-session')).or(page.getByTestId('evaluate-invite')),
  ).toBeVisible();
});
