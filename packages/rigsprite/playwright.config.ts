import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM_PATH: optional path to a pre-installed Chromium executable.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5220', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true,
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5220 --strictPort',
    url: 'http://localhost:5220',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
