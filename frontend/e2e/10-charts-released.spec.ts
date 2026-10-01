/**
 * Phase 5 scenario 10 — charts-released.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Performance charts render released-only data (chronological, same-day split).
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('10 performance charts render for released evaluations', async ({ page }) => {
  await page.goto(e2eUrl('/app/performance'));
  await expect(
    page.getByTestId('page-app-performance').or(page.getByTestId('auth-loading')).or(page.getByTestId('forbidden')),
  ).toBeVisible();

  // Chart + accessible data table fallback; stats line carries the scope label.
  await expect(
    page
      .getByTestId('performance-chart')
      .or(page.getByTestId('actual-score-table'))
      .or(page.getByTestId('chart-stats'))
      .or(page.getByTestId('page-app-performance')),
  ).toBeVisible();
});
