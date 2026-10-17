import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const port = 4187;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL },
  webServer: {
    ...base.webServer,
    command: `node node_modules/vite/bin/vite.js preview --configLoader runner --host 127.0.0.1 --port ${port} --strictPort --outDir dist/qa-assignee-compact`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
