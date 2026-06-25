import { test, expect } from '@playwright/test';
import { loginAs, mockAirstripApi } from './helpers';
import { listResponse, katoDetail, options, contractors, managers, settings } from './fixtures';

const mocks = () => ({ list: listResponse, detail: () => katoDetail(), options, contractors, managers, settings });

test.beforeEach(async ({ context, page }) => {
  await loginAs(context, 'agency_manager', 'HAS');
  await mockAirstripApi(page, mocks());
});

test('Needs Attention section renders with red never-recorded strip + responsibility unassigned', async ({ page }) => {
  await page.goto('/airstrips');

  // The pinned queue renders. (The full warning messages are unique to the queue —
  // the table rows use compact "Overdue"/"Due soon" labels.)
  await expect(page.getByRole('heading', { name: 'Needs Attention' })).toBeVisible();

  // Never-recorded strip appears in red, flagged unassigned.
  await expect(page.getByText('Imbaimadai has no maintenance on record')).toBeVisible();
  await expect(page.getByText('responsibility unassigned')).toBeVisible();
  await expect(page.locator('span.text-red-400', { hasText: 'no maintenance on record' }).first()).toBeVisible();

  // Assigned overdue strip names its contractor + manager inline.
  await expect(page.getByText('Kato is 25 days overdue')).toBeVisible();
  await expect(page.getByText('contractor: J. Williams, manager: Akeem')).toBeVisible();

  await page.screenshot({ path: 'e2e/screenshots/01-list-needs-attention.png', fullPage: true });
});

test('summary + queue list both strips needing attention; the ok strip is not in the queue', async ({ page }) => {
  await page.goto('/airstrips');
  await expect(page.getByRole('heading', { name: 'Needs Attention' })).toBeVisible();
  // The queue reports 2 airstrips; both attention strips are named; Ogle (ok) has no warning.
  await expect(page.getByText('2 airstrips')).toBeVisible();
  await expect(page.getByText('Kato is 25 days overdue')).toBeVisible();
  await expect(page.getByText('Imbaimadai has no maintenance on record')).toBeVisible();
  await expect(page.getByText(/Ogle .*(overdue|due)/)).toHaveCount(0);
});
