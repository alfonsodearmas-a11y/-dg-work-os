import { test, expect } from '@playwright/test';
import { loginAs, mockAirstripApi } from './helpers';
import { listResponse, katoDetail, options, contractors, managers, settings } from './fixtures';

test('detail renders Maintenance Health + Responsibility, and a photo paints through the proxy', async ({ context, page }) => {
  await loginAs(context, 'agency_manager', 'HAS');
  await mockAirstripApi(page, { list: listResponse, detail: () => katoDetail(), options, contractors, managers, settings });

  await page.goto('/airstrips/kato');

  await expect(page.getByRole('heading', { name: 'Kato' })).toBeVisible();
  await expect(page.getByText('Maintenance Health')).toBeVisible();
  await expect(page.getByText('Responsibility').first()).toBeVisible();
  await expect(page.getByText('J. Williams').first()).toBeVisible();   // responsible contractor
  await expect(page.getByText('Akeem').first()).toBeVisible();         // responsible manager

  // Photos tab: the <img> resolves via /api/airstrips/kato/photos/p1/file and actually paints.
  await page.getByText('Photos', { exact: true }).first().click();
  const img = page.locator('img[src*="/photos/"][src*="/file"]').first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);

  await page.screenshot({ path: 'e2e/screenshots/02-detail.png', fullPage: true });
});

test('Generate Report opens the PDF route with the chosen date range', async ({ context, page }) => {
  await loginAs(context, 'agency_manager', 'HAS');
  await mockAirstripApi(page, { list: listResponse, detail: () => katoDetail(), options, contractors, managers, settings });

  // The modal downloads via window.open — spy on it to capture the URL deterministically.
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    const orig = window.open;
    window.open = ((url?: string | URL) => { (window as unknown as { __opened: string[] }).__opened.push(String(url)); return null; }) as typeof orig;
  });

  await page.goto('/airstrips/kato');
  await page.getByRole('button', { name: /Report/ }).click();
  await expect(page.getByRole('heading', { name: 'Generate Report' })).toBeVisible();
  await page.getByRole('button', { name: /Download PDF/ }).click();

  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(opened.some(u => /\/api\/airstrips\/kato\/report\.pdf\?from=.*&to=/.test(u))).toBe(true);
});

test('assigning a different contractor swaps the open row and the badge updates', async ({ context, page }) => {
  await loginAs(context, 'agency_manager', 'HAS');
  let assigned = false;
  await mockAirstripApi(page, {
    list: listResponse,
    detail: () => (assigned ? katoDetail({ contractorName: 'A. Persaud', managerName: 'Akeem' }) : katoDetail()),
    options, contractors, managers, settings,
    onAssignContractor: () => { assigned = true; },
  });

  await page.goto('/airstrips/kato');
  await expect(page.getByText('J. Williams').first()).toBeVisible();

  // Open the Responsibility editor (the Edit button inside the Responsibility card).
  await page.locator('div.glass-card', { hasText: 'Responsibility' }).getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Responsibility' })).toBeVisible();
  await page.locator('select').first().selectOption({ label: 'A. Persaud' });
  await page.getByRole('button', { name: 'Save' }).click();

  // After the swap, the Responsibility card shows the new contractor.
  await expect(page.getByText('A. Persaud').first()).toBeVisible();
});
