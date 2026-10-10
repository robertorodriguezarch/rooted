import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// Public test configuration only. Every Supabase and Rooted API request in
// this suite is mocked; passing it does not establish live service readiness.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'phase2.spec.js',
  outputDir: '/tmp/rooted-phase2-browser-results',
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4183',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    launchOptions: existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4183 --strictPort',
    url: 'http://127.0.0.1:4183',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      VITE_SUPABASE_URL: 'https://rooted-auth.test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_phase2_test_public',
      VITE_DATA_MODE: 'live',
    },
  },
})
