// Browser tests for Petty Cash. They run against a stack that is ALREADY UP (this app :3010 and
// Minty, the Flask app, on :5001 locally) -- nothing is started here, as in the sibling apps.
// See e2e/README.md.
//
// Two projects: a computer, and a 360px phone - Petty Cash is used on a phone more than 95% of
// the time (Part 15.15), so every journey runs at the phone width too.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    // localhost, not 127.0.0.1: it is the origin Flask allows by default (PETTY_CASH_WEB_URL).
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3010",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
