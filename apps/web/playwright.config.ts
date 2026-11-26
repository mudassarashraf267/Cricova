import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e', timeout: 60000, retries: 0,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 390, height: 800 }, reducedMotion: 'reduce' },
  webServer: [
    { command: 'npx vite --port 5173', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60000 },
    // throwaway in-memory server for the sync tests (fresh every run, so first-run setup is testable)
    { command: 'npm run start -w @cricketpro/api', cwd: '../..', url: 'http://localhost:3001/health', reuseExistingServer: false, timeout: 60000, env: { DB_FILE: ':memory:', PORT: '3001', WEB_DIR: 'none' } },
  ],
});
