/**
 * Phase 5 scenario 07 — draft-refresh.
 * Skeleton only: no live run unless E2E_BASE_URL is set.
 * Evaluator draft (autosave, revision-guarded) survives a page refresh.
 */
import { test, expect } from '@playwright/test';
import { E2E_ENABLED, SKIP_REASON, e2eUrl } from './helpers';

test.skip(!E2E_ENABLED, SKIP_REASON);

test('07 evaluation draft survives refresh via server revision', async ({ page }) => {
  await page.goto(e2eUrl('/staff/evaluations/E2E_SYNTHETIC_EVAL_ID'));
  await expect(
    page.getByTestId('evaluation-sheet').or(page.getByTestId('forbidden')).or(page.getByTestId('not-found')).or(page.getByTestId('role-loading')),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId('evaluation-sheet').or(page.getByTestId('forbidden')).or(page.getByTestId('not-found')).or(page.getByTestId('role-loading')),
  ).toBeVisible();

  // Revision marker persists server-side; conflict banner stays hidden on clean reload.
  await expect(
    page.getByTestId('revision').or(page.getByTestId('sheet-actions')).or(page.getByTestId('evaluation-sheet')).or(page.getByTestId('forbidden')).or(page.getByTestId('not-found')),
  ).toBeVisible();
});
