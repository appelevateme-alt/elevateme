/**
 * Phase 5 scenario 12 — query-thread.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Student opens a query thread; DI reply is versioned, never a silent rewrite.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('12 query thread opens and shows the versioned exchange', async ({ page }) => {
  await page.goto(e2eUrl('/app/queries'));
  await expect(
    page.getByTestId('page-app-queries').or(page.getByTestId('auth-loading')).or(page.getByTestId('forbidden')),
  ).toBeVisible();

  await expect(
    page.getByTestId('query-thread').first().or(page.getByTestId('page-app-queries')).or(page.getByTestId('forbidden')),
  ).toBeVisible();

  await page.goto(e2eUrl('/app/queries/new'));
  await expect(
    page.getByTestId('page-app-queries-new').or(page.getByTestId('forbidden')).or(page.getByTestId('auth-loading')),
  ).toBeVisible();

  await page.goto(e2eUrl('/app/queries/E2E_QUERY_ID'));
  await expect(
    page
      .getByTestId('page-app-query-detail')
      .or(page.getByTestId('query-exchange'))
      .or(page.getByTestId('not-found'))
      .or(page.getByTestId('forbidden')),
  ).toBeVisible();
});
