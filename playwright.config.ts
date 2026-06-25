import { defineConfig, devices } from '@playwright/test';

// E2E for the airstrips UI. Renders the real Next app in Chromium with a
// deterministic gated test session (lib/e2e-auth.ts) and fully-mocked APIs, so no
// request ever reaches prod. CI-ready: `webServer` starts the dev server with the
// E2E flag (and reuses one already running locally).
const PORT = process.env.E2E_PORT || '3100';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts/test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'e2e/.artifacts/report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `E2E_AUTH_BYPASS=1 PORT=${PORT} npm run dev`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { E2E_AUTH_BYPASS: '1' },
  },
});
