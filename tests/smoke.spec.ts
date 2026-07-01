import { test, expect } from '@playwright/test';

const SHOTS = 'docs/screenshots';

test('loads without console errors and renders the shell', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  // map container present
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  // provider health bar present
  await expect(page.getByText('SOURCES', { exact: true })).toBeVisible();

  await page.waitForTimeout(3500); // allow data + tiles to settle
  await page.screenshot({ path: `${SHOTS}/01-initial-load.png` });

  // Ignore benign tile/network noise; fail only on app/runtime errors.
  const appErrors = errors.filter(
    (e) => !/tile|carto|Failed to fetch|net::ERR|ERR_|favicon/i.test(e),
  );
  expect(appErrors, appErrors.join('\n')).toHaveLength(0);
});

test('layer toggle works', async ({ page }) => {
  await page.goto('/');
  const checkbox = page.getByRole('checkbox', { name: /Earthquakes/i });
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await page.screenshot({ path: `${SHOTS}/02-layer-toggled.png` });
});

test('command palette opens via Ctrl+K', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible(); // app mounted
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();
  await expect(page.getByPlaceholder(/Type a command/i)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-command-palette.png` });
});

test('mobile viewport renders', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/04-mobile.png` });
});
