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
  // "Could not compile fragment shader" is a maplibre-gl v5 + SwiftShader
  // (software GL, this Pi's headless Chromium) artifact: reproduces on plain
  // 2D load with zero globe/country code involved (bisected against the
  // pre-upgrade v4.7.1 build, which never emits it), yet every visual/
  // functional assertion in this suite — including the 2D/3D globe toggle —
  // still passes, so real WebGL2-capable browsers are not expected to hit it.
  // "status of 5xx" covers a third-party feed being down (seen: 503) — the
  // failure is already surfaced honestly as DEMO/SAMPLE + provider health,
  // and the browser's resource-error console line can't be suppressed.
  const appErrors = errors.filter(
    (e) => !/tile|carto|Failed to fetch|net::ERR|ERR_|favicon|blocked by CORS policy|Could not compile fragment shader|Failed to load resource: the server responded with a status of 5\d\d/i.test(e),
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

test('infrastructure: nuclear power plants and launch sites sources and layers are present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Nuclear power plants', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Toggle source: Nuclear Power Plants (WRI)' })).toBeVisible();
  await expect(page.locator('.health-chip', { hasText: 'Nuclear Power Plants (WRI)' })).toBeVisible();

  await expect(page.getByRole('checkbox', { name: 'Space launch sites', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Toggle source: Space Launch Sites (GCAT)' })).toBeVisible();
  await expect(page.locator('.health-chip', { hasText: 'Space Launch Sites (GCAT)' })).toBeVisible();

  // vendored static registry: honestly labeled cache, not live
  const plantsChip = page.locator('.health-chip', { hasText: 'Nuclear Power Plants (WRI)' });
  await expect(plantsChip).toContainText(/cache/i);
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
  // structural indicators (population/GDP/income group) are context only,
  // never blended into the alert-weight score
  await expect(panel.getByText(/never blended into the score/)).toBeVisible();

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
  test.setTimeout(60_000); // refreshAll batches 7 fetchers + markets; slow on this Pi
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3500); // let feeds load
  await expect(page.locator('.health-chip', { hasText: 'USGS' })).not.toContainText('LOADING', { timeout: 20000 });

  const panel = page.getByLabel('Markets', { exact: true });
  await expect(panel.getByText('MARKETS')).toBeVisible();
  // mode tag is derived from the real fetch — LIVE or the honest SAMPLE label
  await expect(panel.locator('.tag')).toHaveText(/LIVE|SAMPLE/);
  // both feeds are attributed; USD/EUR exists in live and sample data alike
  await expect(panel.getByText('USD/EUR')).toBeVisible();
  await expect(panel.getByText(/Frankfurter · price data by CoinGecko/)).toBeVisible();
});

test('FOMC calendar shows the next upcoming meeting, attributed and honest', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(3500); // let the vendored calendar load

  const panel = page.getByLabel('Markets', { exact: true });
  await expect(panel.getByText('FOMC CALENDAR')).toBeVisible();
  // 2026-07-05 "today" -> next meeting in the vendored 2026 schedule is Jul 28-29
  await expect(panel.getByText('Jul 28–29, 2026')).toBeVisible();
  await expect(panel.getByText(/Federal Reserve/)).toBeVisible();
  await expect(page.locator('.health-chip', { hasText: 'FOMC Meeting Calendar' })).toBeVisible();
});

test('markets source toggle disables the panel honestly', async ({ page }) => {
  await page.goto('/');
  const sourceCheckbox = page.getByRole('checkbox', { name: 'Toggle source: Markets (FX · crypto)' });
  await expect(sourceCheckbox).toBeChecked();
  await sourceCheckbox.uncheck();

  await expect(page.getByLabel('Markets', { exact: true }).getByText('Source disabled')).toBeVisible();
  await expect(page.locator('.health-chip', { hasText: 'Markets' })).toContainText('OFF');

  await sourceCheckbox.check(); // leave state clean for other tests
  await expect(page.getByLabel('Markets', { exact: true }).getByText('USD/EUR')).toBeVisible({ timeout: 15000 });
});

test('dossier: pin from inspector, add note, export MD, unpin', async ({ page }) => {
  test.setTimeout(60_000); // refreshAll batches 7 fetchers + markets; slow on this Pi
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let live events load
  await expect(page.locator('.health-chip', { hasText: 'USGS' })).not.toContainText('LOADING', { timeout: 20000 });

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
  test.setTimeout(60_000); // refreshAll batches 7 fetchers + markets; slow on this Pi
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let live events load so the buttons enable
  await expect(page.locator('.health-chip', { hasText: 'USGS' })).not.toContainText('LOADING', { timeout: 20000 });

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
  await expect(page.getByLabel('Markets', { exact: true }).getByText('USD/EUR')).toBeVisible({ timeout: 15000 });

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

test('AI analyst: generate brief works with zero config (local rules)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await page.waitForTimeout(3000); // let live events load so the brief has something to summarize

  const panel = page.getByLabel('AI analyst');
  await expect(panel.getByText('AI ANALYST')).toBeVisible();
  await expect(panel.getByText('LOCAL RULES', { exact: true })).toBeVisible();

  await panel.getByRole('button', { name: 'GENERATE BRIEF' }).click();
  await expect(panel.locator('.analyst-msg-assistant')).toHaveCount(1);
  await expect(panel.locator('.analyst-msg-assistant').getByText('LOCAL RULES', { exact: true })).toBeVisible();
});

test('AI analyst: disallowed question is refused locally, no key needed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();

  const panel = page.getByLabel('AI analyst');
  await panel.getByLabel('Ask the AI analyst').fill("track this person's pattern of life");
  await panel.getByRole('button', { name: 'ASK', exact: true }).click();

  await expect(panel.getByText(/cannot help with targeting/i)).toBeVisible();
});

test('privacy: clear local data wipes settings after two-step confirm', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();

  // create some local state to prove it gets wiped
  await page.getByLabel('Add monitor keyword').fill('test-monitor-xyz');
  await page.getByLabel('Add monitor keyword').press('Enter');
  await expect(page.getByText('test-monitor-xyz')).toBeVisible();

  const panel = page.getByLabel('Privacy');
  await panel.getByRole('button', { name: 'CLEAR LOCAL DATA' }).click();
  await Promise.all([
    page.waitForEvent('load'),
    panel.getByRole('button', { name: 'CONFIRM CLEAR?' }).click(),
  ]);

  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await expect(page.getByText('test-monitor-xyz')).not.toBeVisible();
});

test('mobile: rails open as bottom sheets from the status-bar toggles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();

  // left rail (panels) opens as a bottom sheet and closes again
  await page.getByRole('button', { name: 'Open panels' }).click();
  await expect(page.locator('.rail.left.open')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close panels' }).click();
  await expect(page.locator('.rail.left.open')).toHaveCount(0);

  // inspector opens as a bottom sheet and closes again
  await page.getByRole('button', { name: 'Open inspector' }).click();
  await expect(page.locator('.rail.right.open')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.locator('.rail.right.open')).toHaveCount(0);
});

test('keyboard: timeline drawer and panel rows are keyboard-operable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();

  // Enter / Space toggle the timeline drawer via the focused head
  const head = page.locator('.timeline-head');
  await head.focus();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(head).toHaveAttribute('aria-expanded', 'false');

  // chokepoint rows are real keyboard buttons: focus + Enter flies the map
  const suez = page.getByRole('button', { name: /Chokepoint Suez Canal/ });
  await suez.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
});

test('reduced motion: region navigation jumps without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });

  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/Type a command/i);
  await input.fill('Go to region: Asia');
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: /command palette/i })).not.toBeVisible();
  // jumpTo path (no flyTo animation) must leave the map healthy
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('2D/3D toggle preserves layer state and persists across reload', async ({ page }) => {
  test.setTimeout(90_000); // globe shader compile + transition is slow on low-power hardware
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });

  // change a layer, then switch projection — the toggle must not reset it
  const wildfires = page.getByRole('checkbox', { name: /Wildfires/i });
  await wildfires.uncheck();

  const btn3d = page.getByRole('button', { name: '3D globe view' });
  const btn2d = page.getByRole('button', { name: '2D map view' });
  await expect(btn2d).toHaveAttribute('aria-pressed', 'true');
  await btn3d.click();
  await expect(btn3d).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(wildfires).not.toBeChecked(); // layer state survived the switch

  // projection is a persisted user setting
  await page.reload();
  await expect(page.getByRole('button', { name: '3D globe view' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/30-globe-3d.png` });

  // and switching back also keeps the map healthy
  await page.getByRole('button', { name: '2D map view' }).click();
  await expect(page.getByRole('button', { name: '2D map view' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('day/night terminator toggle persists and survives 2D/3D switch', async ({ page }) => {
  test.setTimeout(90_000); // terminator fill + globe transition is slow on low-power hardware
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });

  const terminatorBtn = page.getByRole('button', { name: 'Show day/night terminator' });
  await expect(terminatorBtn).toHaveAttribute('aria-pressed', 'false');
  await terminatorBtn.click();
  await expect(page.getByRole('button', { name: 'Hide day/night terminator' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();

  // persisted user setting, like projection
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hide day/night terminator' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });

  // must survive a projection switch without breaking the map
  await page.getByRole('button', { name: '3D globe view' }).click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide day/night terminator' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${SHOTS}/32-terminator.png` });
  await page.getByRole('button', { name: '2D map view' }).click();

  await page.getByRole('button', { name: 'Hide day/night terminator' }).click();
  await expect(page.getByRole('button', { name: 'Show day/night terminator' })).toHaveAttribute('aria-pressed', 'false');
});

test('fullscreen button enters and exits fullscreen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement != null)).toBe(true);

  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement != null)).toBe(false);
});

test('country click selects, inspects, filters timeline, survives 2D/3D, clears', async ({ page }) => {
  test.setTimeout(120_000); // map load + globe transition are slow on low-power hardware
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  // vendored Natural Earth dataset registers as a provider chip once loaded
  await expect(page.getByText('Natural Earth').first()).toBeVisible({ timeout: 15000 });
  // default view centers on [10,25] — Sahara (Algeria), reliably land, rarely
  // markers. The country layer attaches async after the dataset loads, so
  // retry the click until the selection registers.
  const inspector = page.getByLabel('Object inspector');
  await expect(async () => {
    await page.locator('.maplibregl-canvas').click();
    await expect(inspector.getByText('COUNTRY', { exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60000 }); // 50m polygons take longer to become hit-testable on software GL
  await expect(inspector.locator('.insp-title')).not.toBeEmpty();
  const countryName = (await inspector.locator('.insp-title').textContent()) ?? '';
  await expect(inspector.getByText('Region', { exact: true })).toBeVisible();
  await expect(inspector.getByText('Population', { exact: true })).toBeVisible();
  await expect(inspector.getByText('STATIC DATASET')).toBeVisible(); // honest source labeling

  // timeline filter chip appears and clears (expand the drawer first — the
  // collapsed head only shows its top 34px)
  await inspector.getByRole('button', { name: 'View timeline' }).click();
  await expect(page.locator('.timeline-head')).toContainText(`COUNTRY · ${countryName}`);
  await page.getByText('EVENT TIMELINE').click(); // head center is the scrubber — expand via the label
  await expect(page.locator('.timeline-head')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Clear country filter', exact: true }).click();
  await expect(page.locator('.timeline-head')).not.toContainText('COUNTRY ·');

  // projection switch must preserve the country selection
  await page.getByRole('button', { name: '3D globe view' }).click();
  await expect(inspector.locator('.insp-title')).toHaveText(countryName);
  await page.getByRole('button', { name: '2D map view' }).click();

  await page.screenshot({ path: `${SHOTS}/31-country-inspector.png` });
  await inspector.getByRole('button', { name: 'Clear selection' }).click();
  await expect(inspector.getByText('IDLE')).toBeVisible();
});

test('command palette searches events scoped to the current view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });

  // wait for at least one event in the feed, then pick a real title to search
  await expect(page.locator('.tl-item').first()).toBeAttached({ timeout: 20000 });
  const title = (await page.locator('.tl-item').first().locator('span').nth(2).textContent()) ?? '';
  const term = title.split(/\s+/).find((w) => w.length >= 3) ?? title.slice(0, 3);
  expect(term.length).toBeGreaterThanOrEqual(2);

  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/Type a command/i);
  await input.fill(term);

  // at default world view every loaded event is in view, so the searched
  // title must appear as an event result, explicitly labeled as view-scoped
  const eventOption = page.getByRole('option').filter({ hasText: 'event · in view' }).first();
  await expect(eventOption).toBeVisible();

  // running it selects the event (inspector shows it) and closes the palette
  await eventOption.click();
  await expect(page.getByRole('dialog', { name: /command palette/i })).not.toBeVisible();
  await expect(page.getByLabel('Object inspector').locator('.insp-title')).not.toBeEmpty();
});

test('timeline marks events contributing to co-location signals', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await expect(page.locator('.tl-item').first()).toBeAttached({ timeout: 20000 });

  const panelEmpty = await page
    .getByText('No multi-type co-locations in the current feed.')
    .isVisible()
    .catch(() => false);

  const markers = page.locator('.tl-item .tl-signal');
  if (panelEmpty) {
    // honest empty state: no signals computed, so no timeline markers either
    await expect(markers).toHaveCount(0);
  } else {
    // signals exist: their contributing events carry an INFERENCE-labeled
    // marker in the feed (top-200 rows shown, so at least one should surface)
    await expect(markers.first()).toBeAttached();
    await expect(markers.first()).toHaveAttribute('title', /INFERENCE/);
    await expect(markers.first()).toHaveText(/SIGNAL/);
  }
});

test('FIRMS hotspots: BYO-key panel is honest, key adds a health row, clear removes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();

  // zero-config state: panel present, labeled BYO KEY, no FIRMS source row
  const panel = page.getByLabel('FIRMS hotspots');
  await expect(panel.getByText('FIRMS HOTSPOTS')).toBeVisible();
  await expect(panel.getByText('BYO KEY')).toBeVisible();
  await expect(panel.getByText(/overlay, not\s+itemized events/)).toBeVisible(); // honest labeling
  const healthbar = page.getByLabel('Provider health and data freshness');
  await expect(healthbar.getByText('Fire hotspots (NASA FIRMS)')).not.toBeVisible();

  // entering a key registers the provider (reachability check, not key validity)
  const capsRes = page.waitForResponse((r) => r.url().includes('firms.modaps.eosdis.nasa.gov') && r.url().includes('GetCapabilities'), { timeout: 30000 });
  const tileReq = page.waitForRequest((r) => r.url().includes('firms.modaps.eosdis.nasa.gov') && r.url().includes('GetMap'), { timeout: 30000 });
  await panel.getByLabel('NASA FIRMS MAP_KEY').fill('0'.repeat(32));
  await expect(healthbar.getByText('Fire hotspots (NASA FIRMS)')).toBeVisible({ timeout: 20000 });
  // browser-side CORS actually works (the whole reason WMS was chosen over the CSV API)
  expect((await capsRes).ok()).toBe(true);
  // and the map really requests overlay tiles from NASA's WMS
  await tileReq;
  await expect(panel.getByText(/reachability, not key validity|WMS unreachable|Checking NASA WMS/)).toBeVisible({ timeout: 20000 });

  // clearing the key removes the provider row again — no dead OFF row
  await panel.getByRole('button', { name: 'CLEAR KEY' }).click();
  await expect(healthbar.getByText('Fire hotspots (NASA FIRMS)')).not.toBeVisible();
});

test('small countries are selectable: Singapore exists in the vendored 50m dataset', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  const names = await page.evaluate(async () => {
    const res = await fetch('data/ne_countries_50m.json');
    const fc = await res.json();
    return fc.features.map((f: { properties: { NAME: string } }) => f.properties.NAME);
  });
  // the whole Singapore-selects-Malaysia bug: 110m simply omitted microstates
  for (const c of ['Singapore', 'Monaco', 'Malaysia', 'Liechtenstein']) expect(names).toContain(c);
  expect(names.length).toBeGreaterThan(200); // 50m has 242 admin-0 features vs 177 in 110m
});

test('basemap toggle: vivid default, switch to dark, persists across reload', async ({ page }) => {
  const voyagerTile = page.waitForRequest((r) => r.url().includes('rastertiles/voyager'), { timeout: 30000 });
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  await voyagerTile; // vivid (voyager) is the default basemap and really loads

  const toggle = page.getByRole('button', { name: /Switch to dark basemap/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true'); // pressed = vivid on
  await toggle.click();
  await expect(page.getByRole('button', { name: /Switch to vivid basemap/ })).toHaveAttribute('aria-pressed', 'false');

  await page.reload();
  await expect(page.getByRole('button', { name: /Switch to vivid basemap/ })).toBeVisible({ timeout: 15000 }); // dark persisted
});

test('GPS locate-me: opt-in pin appears at the device position and clears on toggle off', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 1.29, longitude: 103.85 }); // Singapore
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });

  const gpsBtn = page.getByRole('button', { name: /Show my device location/ });
  await expect(gpsBtn).toHaveAttribute('aria-pressed', 'false'); // strictly opt-in
  await expect(page.locator('.gps-pin')).not.toBeVisible();

  await gpsBtn.click();
  await expect(page.locator('.gps-pin')).toBeVisible({ timeout: 15000 });

  // the fix also flew the camera to Singapore (zoom ≥9) — clicking beside the
  // pin must now select Singapore itself, not Malaysia (the original bug:
  // 110m data omitted microstates entirely)
  test.setTimeout(90_000); // country layer + flyTo settle slowly on software GL
  const inspector = page.getByLabel('Object inspector');
  // wait for the fix flyTo to actually settle — clicking mid-flight selects
  // whatever country happens to slide under the point (seen: Malaysia)
  await page.waitForFunction(() => {
    const map = (window as unknown as { __terraMap?: import('maplibre-gl').Map }).__terraMap;
    return !!map && map.getZoom() >= 8.5 && !map.isMoving();
  }, undefined, { timeout: 30000 });
  await expect(async () => {
    // project the fix through the live map (layout-independent — the bottom
    // dock shrinks the canvas, so canvas-center math no longer equals the
    // fix), then click 30px north: clear of the pin, still mid-island
    const pos = await page.evaluate(() => {
      const map = (window as unknown as { __terraMap: import('maplibre-gl').Map }).__terraMap;
      const p = map.project([103.85, 1.29]);
      const r = map.getCanvas().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y - 30 };
    });
    await page.mouse.click(pos.x, pos.y);
    await expect(inspector.locator('.insp-title')).toHaveText('Singapore', { timeout: 2000 });
  }).toPass({ timeout: 45000 });
  await inspector.getByRole('button', { name: 'Clear selection' }).click();

  // off = pin gone, no stale fix kept
  await page.getByRole('button', { name: /Stop showing my device location/ }).click();
  await expect(page.locator('.gps-pin')).not.toBeVisible();
});

test('map actually renders event markers (fails on a dead style / blank canvas)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  // The console-error allowlist deliberately tolerates SwiftShader's
  // "Could not compile fragment shader" noise, so this asserts the outcome
  // instead: a loaded style with the events layer actually drawn. A dead map
  // (style null) or an empty render fails here rather than shipping a blank
  // map under a green suite.
  await page.waitForFunction(() => {
    const map = (window as unknown as { __terraMap?: import('maplibre-gl').Map }).__terraMap;
    if (!map || !map.loaded()) return false;
    try {
      return map.queryRenderedFeatures({ layers: ['events-layer'] }).length > 0;
    } catch {
      return false;
    }
  }, undefined, { timeout: 45000 });
});

test('low-zoom country click selects the small country, not its neighbor', async ({ page }) => {
  // At low zoom, tile simplification can swallow tiny polygons, so MapLibre's
  // rendered-feature hit-test reports the neighbor (click Singapore, get
  // Malaysia). Selection resolves against full-resolution geometry instead —
  // this drives that path at zoom 6, where the bug reproduced.
  test.setTimeout(300_000);
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  // the SGX economic-center marker sits exactly on Singapore and marker clicks
  // win over country selection by design — turn that layer off so this test
  // exercises the country hit-test, not the marker
  await page.getByRole('checkbox', { name: 'Economic centers (exchanges)', exact: true }).uncheck();
  await page.waitForFunction(() => {
    const map = (window as unknown as { __terraMap?: import('maplibre-gl').Map }).__terraMap;
    return !!map && map.loaded() && !!map.getSource('countries');
  }, undefined, { timeout: 45000 });

  await page.evaluate(() => {
    const map = (window as unknown as { __terraMap: import('maplibre-gl').Map }).__terraMap;
    map.jumpTo({ center: [103.82, 1.352], zoom: 6 });
    return new Promise((res) => map.once('idle', res));
  });
  const pos = await page.evaluate(() => {
    const map = (window as unknown as { __terraMap: import('maplibre-gl').Map }).__terraMap;
    const p = map.project([103.82, 1.352]);
    const r = map.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });

  const inspector = page.getByLabel('Object inspector');
  await expect(async () => {
    await page.mouse.click(pos.x, pos.y);
    await expect(inspector.getByText('Country (reference)')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30000 });
  await expect(inspector.locator('.insp-title')).toHaveText('Singapore');

  // At zoom 3 Singapore is sub-pixel: a click 4px off its center lands in a
  // point that geometrically belongs to Malaysia. The zoom-scaled microstate
  // tolerance must still magnet the selection onto Singapore.
  await page.evaluate(() => {
    const map = (window as unknown as { __terraMap: import('maplibre-gl').Map }).__terraMap;
    map.jumpTo({ center: [103.82, 1.352], zoom: 3 });
    // idle can stall on slow tile fetches under software GL — selection only
    // needs the camera move, so cap the wait
    return Promise.race([
      new Promise((res) => map.once('idle', res)),
      new Promise((res) => setTimeout(res, 8000)),
    ]);
  });
  const posLow = await page.evaluate(() => {
    const map = (window as unknown as { __terraMap: import('maplibre-gl').Map }).__terraMap;
    const p = map.project([103.82, 1.352]);
    const r = map.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x - 4, y: r.top + p.y };
  });
  await expect(async () => {
    await page.mouse.click(posLow.x, posLow.y);
    await expect(inspector.locator('.insp-title')).toHaveText('Singapore', { timeout: 2000 });
  }).toPass({ timeout: 30000 });
});

test('side rails collapse and reopen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  // left rail visible, then collapse it
  await expect(page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse left panels' }).click();
  await expect(page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' })).not.toBeVisible();
  // reopen
  await page.getByRole('button', { name: 'Expand left panels' }).click();
  await expect(page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' })).toBeVisible();
});

test('country alert-levels toggle with legend', async ({ page }) => {
  await page.goto('/');
  const checkbox = page.getByRole('checkbox', { name: /Country alert levels/i });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeChecked();
  await expect(page.getByText('High alert', { exact: true })).toBeVisible();
  await expect(page.getByText('Conflict zone', { exact: true })).toBeVisible();
});

test('derived DEFCON-style chip shows in the status bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('alert-chip')).toBeVisible();
  await expect(page.getByTestId('alert-chip')).toContainText(/DEFCON [1-5]/);
  await expect(page.getByTestId('alert-chip')).toContainText('DERIVED');
});

test('bottom dock renders news, markets, crypto and youtube panels', async ({ page }) => {
  await page.goto('/');
  const dock = page.getByTestId('bottom-dock');
  await expect(dock).toBeVisible();
  await expect(dock.getByText('WORLD NEWS')).toBeVisible();
  await expect(dock.getByText('REGIONAL NEWS')).toBeVisible();
  await expect(dock.getByText('LIVE TV')).toBeVisible();
  await expect(dock.getByText('CRYPTO')).toBeVisible();
  // news rows or DEMO badge — either satisfies the "honest data" contract
  await expect(dock.locator('.dock-row, .demo-badge').first()).toBeVisible({ timeout: 15000 });
  // youtube loads only on explicit click
  await expect(dock.getByText(/click a channel to load/i)).toBeVisible();
  // collapse
  await dock.getByRole('button', { name: 'Collapse dock' }).click();
  await expect(dock.getByText('WORLD NEWS')).not.toBeVisible();
});

test('layer groups collapse and remember state', async ({ page }) => {
  await page.goto('/');
  const quake = page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' });
  await expect(quake).toBeVisible();
  // collapse the Natural events group — its rows disappear
  await page.getByRole('button', { name: /natural events/i }).click();
  await expect(quake).not.toBeVisible();
  // persisted across reload
  await page.reload();
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' })).not.toBeVisible();
  // reopen
  await page.getByRole('button', { name: /natural events/i }).click();
  await expect(page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' })).toBeVisible();
});

test('derived overlay toggles drive map layer visibility and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  const visibility = (layer: string) =>
    page.evaluate((id) => {
      const map = (window as unknown as { __terraMap: import('maplibre-gl').Map }).__terraMap;
      return map.getLayoutProperty(id, 'visibility');
    }, layer);
  await page.waitForFunction(() => {
    const map = (window as unknown as { __terraMap?: import('maplibre-gl').Map }).__terraMap;
    return !!map && map.loaded() && !!map.getLayer('chokepoints');
  }, undefined, { timeout: 45000 });

  // defaults: hotspots + chokepoints on, trade routes + instability off
  await expect(page.getByRole('checkbox', { name: /Intel hotspots/i })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^⚓ Chokepoints$/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Trade routes/i })).not.toBeChecked();
  expect(await visibility('chokepoints')).toBe('visible');
  expect(await visibility('trade-routes')).toBe('none');

  // toggling flips the map layers
  await page.getByRole('checkbox', { name: /Trade routes/i }).check();
  await expect.poll(() => visibility('trade-routes')).toBe('visible');
  await page.getByRole('checkbox', { name: /^⚓ Chokepoints$/ }).uncheck();
  await expect.poll(() => visibility('chokepoints')).toBe('none');

  // instability paints the country fill layer
  await page.getByRole('checkbox', { name: /Instability index/i }).check();
  await expect.poll(() => visibility('instability-fill'), { timeout: 15000 }).toBe('visible');

  // persisted across reload
  await page.reload();
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Trade routes/i })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^⚓ Chokepoints$/ })).not.toBeChecked();
});

test('curated static registries load with counts and sanctions tint toggles', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });

  // three new reference layers exist, on by default, and their vendored JSON
  // actually loaded (non-zero event counts — a broken fetch shows 0)
  for (const [label, min] of [
    ['Economic centers (exchanges)', 8],
    ['AI data centers', 10],
    ['Nuclear fuel-cycle sites', 14],
  ] as const) {
    const row = page.locator('.layer-row', { has: page.getByRole('checkbox', { name: label, exact: true }) });
    await expect(row.getByRole('checkbox')).toBeChecked();
    await expect(row.locator('.lr-count')).toHaveText(String(min), { timeout: 15000 });
  }

  // sanctions tint: off by default, toggling paints the country fill layer
  const sanctions = page.getByRole('checkbox', { name: /Sanctions/i });
  await expect(sanctions).not.toBeChecked();
  await sanctions.check();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = (window as unknown as { __terraMap: import('maplibre-gl').Map }).__terraMap;
        return map.getLayer('sanctions-fill') ? map.getLayoutProperty('sanctions-fill', 'visibility') : 'missing';
      }),
      { timeout: 15000 },
    )
    .toBe('visible');
});

test('event timeline never overlaps the intel dock, collapsed or expanded', async ({ page }) => {
  // regression: the collapsed timeline's translateY trick pushed its body
  // ("No events loaded yet.") past the map area with nothing clipping it,
  // so it painted on top of the INTEL DOCK region underneath. .map-wrap now
  // clips overflow and .bottom-dock sits at a higher z-index. This probes
  // the actual painted element across the dock's top band (where the leak
  // landed) — not the transform-skewed layout box — and asserts the dock,
  // never the timeline, is what's on top there.
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  const dock = page.getByTestId('bottom-dock');
  await expect(dock).toBeVisible();
  await expect(dock.getByText('INTEL DOCK')).toBeVisible();

  // sample points across the dock's top band, spanning the timeline's own
  // horizontal range (it starts after the left rail, so far-left points miss it)
  const timelineLeaksOverDock = () =>
    page.evaluate(() => {
      const dockEl = document.querySelector('[data-testid="bottom-dock"]');
      if (!dockEl) return true;
      const d = dockEl.getBoundingClientRect();
      for (let i = 1; i < 10; i++) {
        const x = d.left + (d.width * i) / 10;
        for (const y of [d.top + 6, d.top + 24, d.top + 48]) {
          const el = document.elementFromPoint(x, y);
          if (el?.closest('.timeline')) return true; // timeline painted over the dock
        }
      }
      return false;
    });

  // collapsed (default state)
  expect(await timelineLeaksOverDock()).toBe(false);

  // expanded — the failure mode specifically showed up when the timeline
  // body ("No events loaded yet.") was visible
  await page.getByText('EVENT TIMELINE').click();
  await expect(page.getByText('No events loaded yet.')).toBeVisible();
  expect(await timelineLeaksOverDock()).toBe(false);
});

test('military bases layer is opt-in and refuses a world-sized query honestly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  const checkbox = page.getByRole('checkbox', { name: 'Military bases (OSM)', exact: true });
  // default OFF — no Overpass query without opt-in
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  // at the default world view the bbox guard reports an honest offline error
  // instead of firing an unanswerable query at the public endpoint
  const chip = page.locator('.health-chip', { hasText: 'Military bases (OSM Overpass)' });
  await expect(chip).toContainText(/offline/i, { timeout: 15000 });
});

test.describe('globe orient', () => {
  // fixed timezone so the expected longitude is deterministic:
  // Asia/Singapore = UTC+8 → 8 × 15 = 120°E
  test.use({ timezoneId: 'Asia/Singapore' });

  test('entering 3D orients the globe to the timezone longitude', async ({ page }) => {
    test.setTimeout(90_000); // globe projection switch is slow on software GL
    await page.goto('/');
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: '3D globe view' }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const m = (window as unknown as { __terraMap: { getCenter(): { lng: number } } }).__terraMap;
            return Math.abs(m.getCenter().lng - 120);
          }),
        { timeout: 30_000 },
      )
      .toBeLessThan(1);
    // leave state clean for later tests (projection persists)
    await page.getByRole('button', { name: '2D map view' }).click();
  });
});

test('aviation layer is opt-in and refuses a world-sized query honestly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  const checkbox = page.getByRole('checkbox', { name: 'Aircraft (live ADS-B)', exact: true });
  // default OFF — no airplanes.live query without opt-in
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  // at the default world view the bbox guard reports an honest offline error
  const chip = page.locator('.health-chip', { hasText: 'Aircraft (airplanes.live)' });
  await expect(chip).toContainText(/offline/i, { timeout: 15000 });
});

test('satellites overlay: opt-in toggle → CelesTrak chip, dots actually render', async ({ page }) => {
  test.setTimeout(240_000); // 2.7 MB TLE fetch + ~16k satrec init on slow hardware
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  const toggle = page.getByRole('checkbox', { name: '🛰 Satellites (active catalog)' });
  // default OFF, and no CelesTrak health row before opt-in (FIRMS precedent)
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('.health-chip', { hasText: 'Satellites (CelesTrak)' })).toHaveCount(0);
  await toggle.check();
  const chip = page.locator('.health-chip', { hasText: 'Satellites (CelesTrak)' });
  await expect(chip).toContainText(/live|offline/i, { timeout: 90_000 });
  const chipText = (await chip.textContent()) ?? '';
  if (/live/i.test(chipText)) {
    // fetch succeeded → the worker round-trip must actually paint dots
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const m = (window as unknown as { __terraMap: { querySourceFeatures(id: string): unknown[] } }).__terraMap;
            return m.querySourceFeatures('satellites').length;
          }),
        { timeout: 90_000 },
      )
      .toBeGreaterThan(0);
  }
  // honest either way: offline chip with no dots is a pass (no mock, no fake)
  await toggle.uncheck(); // leave persisted state clean
});
