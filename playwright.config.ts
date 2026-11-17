import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'tests',testMatch:'**/*.spec.ts',timeout:60_000,
  webServer:{command:'vite --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173/tests/fixtures/form.html',timeout:15_000},
})
