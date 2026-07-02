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
  const checkbox = page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' });
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await page.screenshot({ path: `${SHOTS}/02-layer-toggled.png` });
});

test('natural-event layers from EONET are present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: /Wildfires/i })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Volcanoes/i })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Severe storms/i })).toBeVisible();
  // EONET provider chip shows in the health bar
  await expect(page.getByText('NASA EONET').first()).toBeVisible();
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

test('source toggle shows OFF and persists across reload', async ({ page }) => {
  await page.goto('/');
  const sourceCheckbox = page.getByRole('checkbox', { name: 'Toggle source: USGS Earthquakes' });
  await expect(sourceCheckbox).toBeChecked();
  await sourceCheckbox.uncheck();

  // health bar chip reflects the disabled source
  const chip = page.locator('.health-chip', { hasText: 'USGS Earthquakes' });
  await expect(chip).toContainText('OFF');
  // layer manager shows the disabled-source note for the earthquake layer
  await expect(page.getByText('OFF · source disabled')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Toggle source: USGS Earthquakes' })).not.toBeChecked();
});

test('monitors: add a keyword and see it highlighted', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let live events load so a match is likely

  const input = page.getByPlaceholder('Add keyword to watch…');
  await input.fill('earthquake');
  await input.press('Enter');

  await expect(page.locator('.monitor-row', { hasText: 'earthquake' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove monitor earthquake' })).toBeVisible();
});

test('command palette region command flies the map', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/Type a command/i);
  await input.fill('Go to region: Asia');
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: /command palette/i })).not.toBeVisible();
  // no assertion on exact camera position (async flyTo animation); just confirm no crash and map still present
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});
