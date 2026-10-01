/**
 * Phase 5 scenario 03 — anon-browse.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Anonymous browsing of public program surfaces; no login required.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('03 anonymous visitor can browse landing and public programs', async ({ page }) => {
  await page.goto(e2eUrl('/'));
  await expect(page.getByTestId('page-home')).toBeVisible();
  await expect(page.getByTestId('public-header')).toBeVisible();

  await page.goto(e2eUrl('/programs'));
  // Programs list renders for anonymous users (auth gates only write paths).
  await expect(page.getByTestId('public-header')).toBeVisible();
});
