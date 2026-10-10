import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

const chromiumPath = '/usr/bin/chromium'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'foundation.spec.js',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    launchOptions: existsSync(chromiumPath) ? { executablePath: chromiumPath } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', VITE_DATA_MODE: 'sample', DATABASE_URL: '' },
  },
})
