import { test, expect } from '@playwright/test';
import { loginAs, mockAirstripApi } from './helpers';
import { listResponse, katoDetail, options, contractors, managers, settings } from './fixtures';

const mocks = () => ({ list: listResponse, detail: () => katoDetail(), options, contractors, managers, settings });

test.beforeEach(async ({ context, page }) => {
  await loginAs(context, 'agency_manager', 'HAS');
  await mockAirstripApi(page, mocks());
});

test('Needs-attention band summarizes real problems; Action queue shows why each strip is flagged', async ({ page }) => {
  await page.goto('/airstrips');

  // Subtitle derives from the data — not the old hardcoded "51 airstrips across 8 regions".
  await expect(page.getByText('3 airstrips across 3 regions')).toBeVisible();

  // The separated band summarizes the estate's real problems (counts derived from the data,
  // stable regardless of filters): overdue + unassigned + never-maintained.
  await expect(page.getByText('Needs attention')).toBeVisible();
  await expect(page.getByText('with no responsible officer assigned')).toBeVisible();
  await expect(page.getByText('with no maintenance ever recorded')).toBeVisible();

  // Drill into the Action queue for the single "why flagged" reason per strip.
  await page.getByRole('button', { name: 'Action queue', exact: true }).click();

  // Never-recorded strip appears in red, flagged unassigned.
  await expect(page.getByText('Imbaimadai has no maintenance on record')).toBeVisible();
  await expect(page.getByText('responsibility unassigned')).toBeVisible();
  await expect(page.locator('span.text-red-400', { hasText: 'no maintenance on record' }).first()).toBeVisible();

  // Assigned overdue strip names its contractor + manager inline.
  await expect(page.getByText('Kato is 25 days overdue')).toBeVisible();
  await expect(page.getByText('contractor: J. Williams, manager: Akeem')).toBeVisible();

  await page.screenshot({ path: 'e2e/screenshots/01-list-needs-attention.png', fullPage: true });
});

test('Action queue lists only strips needing attention; the ok strip is excluded', async ({ page }) => {
  await page.goto('/airstrips');
  await page.getByRole('button', { name: 'Action queue', exact: true }).click();

  // Both attention strips are named; the footer reports 2 flagged; Ogle (ok) is not in the queue.
  await expect(page.getByText('Kato is 25 days overdue')).toBeVisible();
  await expect(page.getByText('Imbaimadai has no maintenance on record')).toBeVisible();
  await expect(page.getByText('Showing 2 of 2 flagged')).toBeVisible();
  await expect(page.getByText('Ogle', { exact: true })).toHaveCount(0);
});
