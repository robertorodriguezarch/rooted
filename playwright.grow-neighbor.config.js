import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// All provider/API traffic is mocked. This exercises the actual frontend and
// Supabase SDK, not a live Gemini response or a live Tiger Data connection.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'grow-neighbor.spec.js',
  outputDir: '/tmp/rooted-grow-neighbor-browser-results',
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4193',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    launchOptions: existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4193 --strictPort',
    url: 'http://127.0.0.1:4193',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      VITE_SUPABASE_URL: 'https://rooted-auth.test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_grow_neighbor_test_public',
      VITE_DATA_MODE: 'live',
      DATABASE_URL: '',
      DATABASE_TEST_URL: '',
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      GEMINI_API_KEY: '',
      NODE_USE_ENV_PROXY: '0',
    },
  },
})
