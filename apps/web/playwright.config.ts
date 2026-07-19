import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright end-to-end configuration for @adaptive-workout/web.
 *
 * Starts the Vite dev server automatically with the E2E auth seam
 * enabled (VITE_E2E_AUTH=true). Supports desktop Chromium and an
 * iPhone-sized mobile emulation project.
 *
 * Features:
 *  - screenshot on failure
 *  - video on failure or first retry
 *  - trace on first retry
 *  - retries enabled only in CI
 *  - no dependency on a manually running frontend
 */

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        headless: true,
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
    {
      name: 'iPhone SE',
      use: {
        ...devices['iPhone SE'],
        browserName: 'chromium',
        headless: true,
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
    {
      name: 'narrow 320px',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
        browserName: 'chromium',
        headless: true,
        launchOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
      },
    },
    {
      name: 'iPhone 14',
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
        headless: true,
        launchOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
      },
    },
  ],

  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: './',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_E2E_AUTH: 'true',
    },
    timeout: 30_000,
  },
});
