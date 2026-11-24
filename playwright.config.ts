import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Use a preinstalled Chromium when available (CI images / sandboxes), otherwise Playwright's own download.
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173', trace: 'off', viewport: { width: 1280, height: 860 }, launchOptions: executablePath ? { executablePath } : {} },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
