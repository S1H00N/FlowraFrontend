import { defineConfig } from '@playwright/test';
import readOnlyConfig from './playwright.live.config';

if (process.env.QA_MUTATIONS !== '1') {
  throw new Error('Set QA_MUTATIONS=1 to run the live lifecycle suite, which creates, edits, and deletes its own QA records.');
}

export default defineConfig({
  ...readOnlyConfig,
  testMatch: 'lifecycle.spec.ts',
  timeout: 300_000,
  outputDir: './test-results/live-lifecycle',
  projects: [{ name: 'live-lifecycle' }],
});
