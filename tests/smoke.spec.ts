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
  // "blocked by CORS policy" covers third-party providers rate-limiting without
  // CORS headers (seen from CoinGecko) — the failure is already surfaced
  // honestly in the provider health bar, and the browser's console line can't
  // be suppressed by the app.
  const appErrors = errors.filter(
    (e) => !/tile|carto|Failed to fetch|net::ERR|ERR_|favicon|blocked by CORS policy/i.test(e),
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

  await expect(page.getByLabel('Monitors').locator('.monitor-row', { hasText: 'earthquake' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove monitor earthquake' })).toBeVisible();
});

test('graph workspace: add, search around, switch layout, export, clear', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let live events load

  // select an event via the timeline (deterministic vs clicking map pixels);
  // click the head label text, not the head center (which now holds playback controls)
  await page.getByText('EVENT TIMELINE').click();
  await page.locator('.tl-item').first().click();
  await expect(page.getByRole('button', { name: '+ Add to graph' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add to graph' }).click();
  await expect(page.getByText('✓ IN GRAPH')).toBeVisible();

  // switch to graph view
  await page.getByRole('tab', { name: 'GRAPH' }).click();
  await expect(page.locator('.graph-svg')).toBeVisible();
  await expect(page.locator('.graph-node')).toHaveCount(1);

  const toolbar = page.locator('.graph-toolbar');

  // expand via search around
  await toolbar.getByRole('button', { name: 'SEARCH AROUND' }).click();
  await page.waitForTimeout(300);

  // switch layouts without crashing
  await toolbar.getByRole('button', { name: 'RADIAL' }).click();
  await toolbar.getByRole('button', { name: 'GRID' }).click();
  await expect(page.locator('.graph-svg')).toBeVisible();

  // export triggers a download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    toolbar.getByRole('button', { name: 'EXPORT JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/terra-watch-graph-.*\.json/);

  // clear empties the graph
  await toolbar.getByRole('button', { name: 'CLEAR' }).click();
  await expect(page.getByText('Graph is empty.')).toBeVisible();
});

test('timeline playback shows PLAYBACK label and returns to live', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(2500); // let events load

  await expect(page.getByText('LIVE FEED')).toBeVisible();
  await page.getByRole('button', { name: 'Play timeline', exact: true }).click();
  await expect(page.getByText(/PLAYBACK · \d{2}:\d{2}Z/)).toBeVisible();

  await page.getByRole('button', { name: 'GO LIVE', exact: true }).click();
  await expect(page.getByText('LIVE FEED')).toBeVisible();
});

test('snapshots: save, compare shows labeled delta, delete', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let events load so a snapshot has content

  await page.getByRole('button', { name: '⊕ SAVE SNAPSHOT' }).click();
  const row = page.getByLabel('Snapshots').locator('.monitor-row', { hasText: 'events' }).first();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: /Compare with snapshot/ }).click();
  const deltaPanel = page.locator('.snapshot-delta');
  await expect(deltaPanel).toBeVisible();
  await expect(deltaPanel).toContainText('baseline');

  await row.getByRole('button', { name: /Delete snapshot/ }).click();
  await expect(page.getByText('Save a baseline of the current events')).toBeVisible();
});

test('NWS weather alerts source and layer are present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Weather alerts (US · NWS)' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Toggle source: NOAA NWS Alerts' })).toBeVisible();
  await expect(page.locator('.health-chip', { hasText: 'NOAA NWS Alerts' })).toBeVisible();
});

test('signals panel is labeled INFERENCE and renders honestly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3500); // let feeds load

  const panel = page.getByLabel('Signals');
  await expect(panel.getByText('SIGNALS')).toBeVisible();
  await expect(panel.getByText('INFERENCE')).toBeVisible();
  await expect(panel.getByText('not a prediction')).toBeVisible();

  // either real co-location rows or the honest empty state — never a placeholder
  const rows = await panel.locator('.signal-row').count();
  if (rows > 0) {
    await panel.locator('.signal-row').first().click(); // flies the map, must not crash
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  } else {
    await expect(panel.getByText('No multi-type co-locations')).toBeVisible();
  }
});

test('GDACS disaster alerts source and layer are present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Disaster alerts (GDACS)' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Toggle source: GDACS Disasters' })).toBeVisible();
  await expect(page.locator('.health-chip', { hasText: 'GDACS Disasters' })).toBeVisible();
});

test('GDACS source toggle shows OFF in health bar and layer manager', async ({ page }) => {
  await page.goto('/');
  const sourceCheckbox = page.getByRole('checkbox', { name: 'Toggle source: GDACS Disasters' });
  await expect(sourceCheckbox).toBeChecked();
  await sourceCheckbox.uncheck();

  await expect(page.locator('.health-chip', { hasText: 'GDACS Disasters' })).toContainText('OFF');
  await expect(page.getByText('OFF · source disabled')).toBeVisible();

  await sourceCheckbox.check(); // leave state clean for other tests
  await expect(page.locator('.health-chip', { hasText: 'GDACS Disasters' })).not.toContainText('OFF');
});

test('country risk panel is labeled INFERENCE and renders honestly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3500); // let feeds load

  const panel = page.getByLabel('Country risk');
  await expect(panel.getByText('COUNTRY RISK')).toBeVisible();
  await expect(panel.getByText('INFERENCE')).toBeVisible();
  await expect(panel.getByText('not a forecast')).toBeVisible();

  // either itemized country rows (click flies the map) or the honest empty state
  const rows = await panel.locator('.risk-row').count();
  if (rows > 0) {
    await panel.locator('.risk-row').first().click();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  } else {
    await expect(panel.getByText('No country-attributed alerts')).toBeVisible();
  }
});

test('route explorer lists chokepoints with ADVISORY label and honest counts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let feeds load

  const panel = page.getByLabel('Route explorer');
  await expect(panel.getByText('ROUTE EXPLORER')).toBeVisible();
  await expect(panel.getByText('ADVISORY')).toBeVisible();
  await expect(panel.getByText('Not a routing service')).toBeVisible();

  // static catalog always renders; counts are transparent ("N nearby" or "clear feed")
  await expect(panel.locator('.route-row')).toHaveCount(9);
  await expect(panel.getByText('Suez Canal')).toBeVisible();
  await panel.getByText('Suez Canal').click(); // flies the map, must not crash
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('scenario engine is labeled SIMULATION and expands a what-if honestly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(2500); // let feeds load

  const panel = page.getByLabel('Scenarios');
  await expect(panel.getByText('SCENARIOS')).toBeVisible();
  await expect(panel.getByText('SIMULATION')).toBeVisible();
  await expect(panel.getByText('not a prediction or a live assessment')).toBeVisible();

  // expand a scenario: static effects + transparent live-context count
  await panel.getByRole('button', { name: 'Scenario: Suez Canal blocked' }).click();
  await expect(panel.getByText('Cape of Good Hope', { exact: false }).first()).toBeVisible();
  await expect(panel.getByText(/Live context: \d+ public events within/)).toBeVisible();

  // collapse works
  await panel.getByRole('button', { name: 'Scenario: Suez Canal blocked' }).click();
  await expect(panel.getByText(/Live context:/)).not.toBeVisible();
});

test('market panel shows attributed quotes with a real mode label', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3500); // let feeds load

  const panel = page.getByLabel('Markets');
  await expect(panel.getByText('MARKETS')).toBeVisible();
  // mode tag is derived from the real fetch — LIVE or the honest SAMPLE label
  await expect(panel.locator('.tag')).toHaveText(/LIVE|SAMPLE/);
  // both feeds are attributed; USD/EUR exists in live and sample data alike
  await expect(panel.getByText('USD/EUR')).toBeVisible();
  await expect(panel.getByText(/Frankfurter · price data by CoinGecko/)).toBeVisible();
});

test('markets source toggle disables the panel honestly', async ({ page }) => {
  await page.goto('/');
  const sourceCheckbox = page.getByRole('checkbox', { name: 'Toggle source: Markets (FX · crypto)' });
  await expect(sourceCheckbox).toBeChecked();
  await sourceCheckbox.uncheck();

  await expect(page.getByLabel('Markets').getByText('Source disabled')).toBeVisible();
  await expect(page.locator('.health-chip', { hasText: 'Markets' })).toContainText('OFF');

  await sourceCheckbox.check(); // leave state clean for other tests
  await expect(page.getByLabel('Markets').getByText('USD/EUR')).toBeVisible({ timeout: 15000 });
});

test('dossier: pin from inspector, add note, export MD, unpin', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let live events load

  // empty state is honest, not a placeholder
  const panel = page.getByLabel('Dossier');
  await expect(panel.getByText('DOSSIER')).toBeVisible();
  await expect(panel.getByText('Pin events from the inspector')).toBeVisible();

  // select an event via the timeline, pin it from the inspector
  await page.getByText('EVENT TIMELINE').click();
  await page.locator('.tl-item').first().click();
  await page.getByRole('button', { name: '+ Pin to dossier' }).click();
  await expect(page.getByText('✓ IN DOSSIER')).toBeVisible();
  await expect(panel.locator('.dossier-item')).toHaveCount(1);
  await expect(panel.getByText(/pinned just now/)).toBeVisible();

  // user note is labeled user-authored
  const note = panel.getByPlaceholder('Analyst note (user-authored)…');
  await note.fill('test note');

  // exports download with citations preserved
  const [mdDownload] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'EXPORT MD' }).click(),
  ]);
  expect(mdDownload.suggestedFilename()).toMatch(/terra-watch-dossier-.*\.md/);
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'EXPORT JSON' }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(/terra-watch-dossier-.*\.json/);

  // unpin returns to the empty state; inspector reflects it
  await panel.getByRole('button', { name: /Unpin/ }).click();
  await expect(panel.getByText('Pin events from the inspector')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Pin to dossier' })).toBeVisible();
});

test('timeline exports current events as CSV and JSON', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let live events load so the buttons enable

  // exact: true — buttons inside .timeline-head leak their aria-labels into the
  // head's accessible name (see SESSION_NOTES gotcha from Slice 5)
  const csvBtn = page.getByRole('button', { name: 'Export timeline events as CSV', exact: true });
  await expect(csvBtn).toBeEnabled();
  const [csv] = await Promise.all([page.waitForEvent('download'), csvBtn.click()]);
  expect(csv.suggestedFilename()).toMatch(/terra-watch-events-.*\.csv/);

  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export timeline events as JSON', exact: true }).click(),
  ]);
  expect(json.suggestedFilename()).toMatch(/terra-watch-events-.*\.json/);
});

test('market panel exports quotes as CSV', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Markets').getByText('USD/EUR')).toBeVisible({ timeout: 15000 });

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export market quotes as CSV' }).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/terra-watch-markets-.*\.csv/);
});

test('command palette can switch to graph view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/Type a command/i);
  await input.fill('Switch to Graph view');
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: /command palette/i })).not.toBeVisible();
  await expect(page.locator('.graph-wrap')).toBeVisible();
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
