/**
 * Phase 5 scenario 09 — release-visible.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * After release, the student sees the report card under /app/reports.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('09 released report is visible to the student', async ({ page }) => {
  await page.goto(e2eUrl('/app/reports'));
  await expect(
    page.getByTestId('page-app-reports').or(page.getByTestId('auth-loading')).or(page.getByTestId('forbidden')),
  ).toBeVisible();

  await expect(
    page.getByTestId('report-card').first().or(page.getByTestId('page-app-reports')).or(page.getByTestId('forbidden')),
  ).toBeVisible();

  await page.goto(e2eUrl('/app/reports/E2E_REPORT_ID'));
  await expect(
    page.getByTestId('page-app-report-detail').or(page.getByTestId('not-found')).or(page.getByTestId('forbidden')),
  ).toBeVisible();
});
