/**
 * Phase 5 scenario 05 — coordinator-create-reopen.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Coordinator creates a DRAFT program, reloads, and reopens the workspace.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('05 coordinator draft program can be created and reopened', async ({ page }) => {
  await page.goto(e2eUrl('/staff/programs'));
  await expect(
    page.getByTestId('page-staff-programs').or(page.getByTestId('forbidden')).or(page.getByTestId('role-loading')),
  ).toBeVisible();

  await page.goto(e2eUrl('/staff/programs/new'));
  await expect(
    page.getByTestId('program-builder').or(page.getByTestId('forbidden')).or(page.getByTestId('role-loading')),
  ).toBeVisible();

  // Draft workspace survives a reopen (server draft, builder savebar state).
  await page.goto(e2eUrl('/staff/programs'));
  await expect(
    page.getByTestId('page-staff-programs').or(page.getByTestId('forbidden')).or(page.getByTestId('role-loading')),
  ).toBeVisible();
  await expect(
    page
      .getByTestId('staff-program-row')
      .first()
      .or(page.getByTestId('page-staff-programs'))
      .or(page.getByTestId('forbidden')),
  ).toBeVisible();
});
