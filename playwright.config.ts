import { defineConfig, devices } from '@playwright/test';

// Own port per checkout so parallel worktrees never test each other's dev server.
const port = Number(process.env.E2E_PORT ?? 5190);
// The online host for tests/e2e/online.spec.ts, on its own port per checkout too.
const hostPort = Number(process.env.E2E_HOST_PORT ?? port + 600);
process.env.E2E_HOST_PORT = String(hostPort);

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  // On CI a failed test gets one more try; one that passes on it shows up as flaky in the run's annotations.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `npx vite --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx tsx scripts/host.ts --port ${hostPort}`,
      url: `http://localhost:${hostPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
