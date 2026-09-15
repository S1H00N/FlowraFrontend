import { defineConfig } from '@playwright/test';

const port = 4175;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  outputDir: process.env.QA_RESULTS_DIR || './test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.QA_REPORT_DIR || 'playwright-report', open: 'never' }],
    ['json', { outputFile: `${process.env.QA_REPORT_DIR || 'playwright-report'}/results.json` }],
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    // Use an installed Chrome; set PW_CHANNEL=chromium after playwright install
    // chromium to run with Playwright's bundled browser instead.
    channel: process.env.PW_CHANNEL || 'chrome',
    headless: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'desktop', testIgnore: /(?:layout|visual)\.spec\.ts/, use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', testIgnore: /(?:layout|visual)\.spec\.ts/, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'layout', testMatch: /layout\.spec\.ts/ },
    { name: 'visual', testMatch: /visual\.spec\.ts/ },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js build --outDir dist/qa && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort --outDir dist/qa`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_API_BASE_URL: 'http://qa-api.invalid/api/v1',
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_APP_ID: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '',
      VITE_FIREBASE_VAPID_KEY: '',
    },
  },
});
