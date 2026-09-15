import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const variableNames = ['QA_WEB_BASE_URL', 'QA_API_BASE_URL', 'QA_EMAIL', 'QA_PASSWORD'] as const;
let fileValues: Record<string, string | undefined> = {};
try {
  fileValues = parseEnv(readFileSync(new URL('./.env.qa.local', import.meta.url), 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw new Error('Unable to read .env.qa.local. Check its UTF-8 encoding and KEY=value format.');
  }
}
for (const name of variableNames) {
  if (!process.env[name]) process.env[name] = fileValues[name];
}
const missing = variableNames.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  throw new Error(`Set these names in artifacts/flowra-web/.env.qa.local before running live smoke: ${missing.join(', ')}`);
}

function validatedBaseURL(name: 'QA_WEB_BASE_URL' | 'QA_API_BASE_URL') {
  try {
    const url = new URL(process.env[name]!);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
    return url.href.replace(/\/+$/, '');
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) base URL without credentials, a query, or a hash.`);
  }
}

export const liveEnvironment = {
  webBaseURL: validatedBaseURL('QA_WEB_BASE_URL'),
  apiBaseURL: validatedBaseURL('QA_API_BASE_URL'),
  email: process.env.QA_EMAIL!,
  password: process.env.QA_PASSWORD!,
};

// Playwright 1.58 otherwise saves a DOM snapshot on failure, including account data.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

export default defineConfig({
  testDir: './tests/live',
  testMatch: 'smoke.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 150_000,
  expect: { timeout: 15_000 },
  outputDir: './test-results/live',
  preserveOutput: 'never',
  reporter: [['list']],
  use: {
    baseURL: `${liveEnvironment.webBaseURL}/`,
    browserName: 'chromium',
    channel: process.env.PW_CHANNEL || 'chrome',
    headless: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    permissions: [],
    acceptDownloads: false,
    storageState: { cookies: [], origins: [] },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 12_000,
    navigationTimeout: 25_000,
  },
  projects: [{ name: 'live-read-only' }],
  // The live suite deliberately has no webServer and is never part of the mock suite.
});
