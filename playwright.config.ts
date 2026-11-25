import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const PORT = 3101;
// A fresh database per run, so the seeded demo data is always the starting point.
const dbPath = path.join(os.tmpdir(), `quire-e2e-${Date.now()}`, 'quire.db');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // tests share one server and seeded users
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Use an installed Chrome locally if PLAYWRIGHT_CHROME points at one
    launchOptions: process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server/dist/index.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      DATABASE_PATH: dbPath,
      CLIENT_DIST: path.resolve('client/dist'),
      NODE_ENV: 'test',
    },
  },
});
