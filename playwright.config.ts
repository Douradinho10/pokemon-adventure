import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/playwright',
  timeout: 30_000,
  use: {
    headless: true,
    baseURL: 'http://localhost:3001',
    viewport: { width: 1280, height: 800 },
  },
})
