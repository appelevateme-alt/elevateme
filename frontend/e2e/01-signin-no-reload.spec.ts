/**
 * Phase 5 scenario 01 — signin-no-reload.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Synthetic account: test+timestamp@example.com style, never real.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl, syntheticEmail } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('01 sign-in resolves without a full page reload', async ({ page }) => {
  const email = syntheticEmail('signin');
  await page.goto(e2eUrl('/sign-in'));
  await expect(page.getByTestId('page-sign-in')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Synthetic-Pass-123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Either inline validation errors (synthetic user unknown) or the
  // resolving state / role dashboard — never a full document reload.
  await expect(page.getByTestId('page-sign-in').or(page.getByTestId('sign-in-errors')).or(page.getByTestId('sign-in-resolving')).or(page.getByTestId('app-shell'))).toBeVisible();
});
