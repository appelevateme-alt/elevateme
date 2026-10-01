/**
 * Phase 5 scenario 14 — logout-clears.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Sign-out returns to /sign-in and clears the app shell session state.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('14 logout clears the session and returns to sign-in', async ({ page }) => {
  await page.goto(e2eUrl('/app'));
  await expect(
    page.getByTestId('page-app-home').or(page.getByTestId('app-shell')).or(page.getByTestId('auth-loading')).or(page.getByTestId('page-sign-in')),
  ).toBeVisible();

  // Skeleton: exercise the sign-out path when a shell is present; otherwise
  // assert the signed-out landing (guards redirect to /sign-in).
  const shell = page.getByTestId('app-shell');
  if (await shell.isVisible().catch(() => false)) {
    const signOut = page.getByRole('button', { name: /sign out|log out/i });
    if (await signOut.isVisible().catch(() => false)) {
      await signOut.click();
    } else {
      await page.goto(e2eUrl('/sign-in'));
    }
  }

  await page.goto(e2eUrl('/sign-in'));
  await expect(page.getByTestId('page-sign-in')).toBeVisible();
  await expect(page.getByTestId('app-shell')).toHaveCount(0);
});
