/**
 * Phase 5 scenario 02 — recovery.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Uses a synthetic test inbox address only; no real emails are sent.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl, syntheticEmail } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('02 forgot-password shows generic sent copy (anti-enumeration)', async ({ page }) => {
  const email = syntheticEmail('recovery');
  await page.goto(e2eUrl('/forgot-password'));
  await expect(page.getByTestId('page-forgot-password')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /send reset link/i }).click();

  // Generic copy on both success and unknown account — never leaks existence.
  await expect(page.getByTestId('forgot-password-sent')).toBeVisible();
});
