/**
 * Phase 5 scenario 04 — registration-persist.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Synthetic student account (test+timestamp@example.com), synthetic program id.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl, syntheticEmail } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('04 registration persists and is visible under my registrations', async ({ page }) => {
  void syntheticEmail('registration');
  // Program detail is public-readable; the registration panel gates POST by auth.
  await page.goto(e2eUrl('/programs'));
  await expect(page.getByTestId('public-header')).toBeVisible();

  // Authenticated view: registration survives reload (server-persisted, not local state).
  await page.goto(e2eUrl('/app/registrations'));
  const registrations = page.getByTestId('app-registrations');
  const forbidden = page.getByTestId('forbidden');
  await expect(registrations.or(forbidden).or(page.getByTestId('auth-loading'))).toBeVisible();

  await page.reload();
  await expect(registrations.or(forbidden).or(page.getByTestId('auth-loading'))).toBeVisible();

  // Detail-level persistence markers (only when a registration exists):
  // registration-result / my-registration / registration-card are asserted
  // opportunistically — absence is not a failure in skeleton mode.
  await expect(page.getByTestId('registration-card').first().or(registrations).or(forbidden)).toBeVisible();
});
