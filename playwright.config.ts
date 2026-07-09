import { defineConfig, devices } from '@playwright/test';

// Assumes a preview server is already running on 4173 (CI can use webServer).
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: undefined } },
  ],
});
