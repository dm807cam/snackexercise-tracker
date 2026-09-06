import { defineConfig, devices } from "@playwright/test";

/**
 * The pre-installed browser in some environments is a different build to the
 * one this Playwright version would download, so allow an override rather than
 * forcing a download that may be blocked.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // A dedicated database so the smoke test never touches real data.
        command:
          "rm -f e2e/e2e.db && DATABASE_URL=file:./e2e/e2e.db npx prisma migrate deploy && DATABASE_URL=file:./e2e/e2e.db npx tsx prisma/seed.ts && DATABASE_URL=file:./e2e/e2e.db PORT=3100 npm run start",
        url: "http://127.0.0.1:3100/api/health",
        reuseExistingServer: false,
        timeout: 120_000,
        env: { TZ: "Europe/Berlin" },
      },
});
