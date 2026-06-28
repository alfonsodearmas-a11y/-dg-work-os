import { test, expect } from '@playwright/test';
import { loginAs, mockAirstripApi } from './helpers';
import { listResponse, katoDetail, options, contractors, managers, settings } from './fixtures';

const mocks = () => ({ list: listResponse, detail: () => katoDetail(), options, contractors, managers, settings });

test('superadmin can open and edit Cadence Settings', async ({ context, page }) => {
  await loginAs(context, 'superadmin', null);
  await mockAirstripApi(page, mocks());

  await page.goto('/airstrips');

  // Cadence Settings now lives in the toolbar "More" menu (secondary actions).
  await page.getByRole('button', { name: 'More' }).click();
  const cadence = page.getByRole('menuitem', { name: 'Cadence Settings' });
  await expect(cadence).toBeVisible();

  await cadence.click();
  await expect(page.getByRole('heading', { name: 'Cadence Settings' })).toBeVisible();
  const interval = page.getByRole('spinbutton').first();           // the number input
  await expect(interval).toBeVisible();
  await expect(interval).toHaveValue('60');
  await interval.fill('75');                                       // editable
  await expect(interval).toHaveValue('75');

  await page.screenshot({ path: 'e2e/screenshots/03-cadence-settings-superadmin.png', fullPage: true });
});

test('HAS agency_manager does NOT see the Cadence Settings control', async ({ context, page }) => {
  await loginAs(context, 'agency_manager', 'HAS');
  await mockAirstripApi(page, mocks());

  await page.goto('/airstrips');
  // The airstrips module IS available to the HAS manager (so the page renders)…
  await expect(page.getByRole('heading', { name: 'Hinterland Airstrips' })).toBeVisible();
  // …but the cadence-settings control is superadmin-only and must be absent even in the More menu.
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('menuitem', { name: 'Cadence Settings' })).toHaveCount(0);
});
