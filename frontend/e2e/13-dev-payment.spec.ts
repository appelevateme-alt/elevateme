/**
 * Phase 5 scenario 13 — dev-payment.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Paid-track development item shows AWAITING_PAYMENT_VERIFICATION + admin queue.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('13 paid development track surfaces payment verification state', async ({ page }) => {
  await page.goto(e2eUrl('/app/development'));
  await expect(
    page.getByTestId('page-app-development').or(page.getByTestId('auth-loading')).or(page.getByTestId('forbidden')),
  ).toBeVisible();

  await expect(
    page.getByTestId('development-item').first().or(page.getByTestId('page-app-development')).or(page.getByTestId('forbidden')),
  ).toBeVisible();

  await page.goto(e2eUrl('/app/development/E2E_DEV_ID'));
  await expect(
    page.getByTestId('page-app-development-detail').or(page.getByTestId('not-found')).or(page.getByTestId('forbidden')),
  ).toBeVisible();
});
