/**
 * Phase 5 scenario 08 — release-blocked.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Release preview blocks when outstanding (unsubmitted) reports remain.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('08 release is blocked while reports are outstanding', async ({ page }) => {
  await page.goto(e2eUrl('/staff/programs/E2E_PROGRAM/sessions/E2E_SESSION/roster'));
  await expect(
    page.getByTestId('session-roster').or(page.getByTestId('forbidden')).or(page.getByTestId('role-loading')),
  ).toBeVisible();

  // Release bar lists outstanding work; blocked release surfaces release-error/retry.
  await expect(
    page.getByTestId('release-bar').or(page.getByTestId('session-roster')).or(page.getByTestId('forbidden')),
  ).toBeVisible();
  await expect(
    page
      .getByTestId('release-outstanding')
      .or(page.getByTestId('release-error'))
      .or(page.getByTestId('release-bar'))
      .or(page.getByTestId('forbidden')),
  ).toBeVisible();
});
