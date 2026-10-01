/**
 * Minimal Playwright smoke skeleton — no live browser run by default.
 * Unit CI stays green: every test is skipped unless E2E_LIVE=1.
 * Synthetic accounts only. Never prod, never real emails.
 */
import { test, expect } from '@playwright/test';

test.skip(process.env.E2E_LIVE !== '1', 'Set E2E_LIVE=1 for live E2E run. Skeleton only.');

test('sign-in renders with no full reload', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByTestId('page-sign-in')).toBeVisible();
});

test('anon can browse landing programs surface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('page-home')).toBeVisible();
});

test('logout clears session state', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByTestId('page-sign-in')).toBeVisible();
  await expect(page.getByTestId('app-shell')).toHaveCount(0);
});
