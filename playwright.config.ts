import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// Ask the OS for a free port once; workers re-evaluate this file and inherit the env var.
process.env.E2E_PORT ||= execFileSync(process.execPath, [
  "-e",
  "const s = require('node:net').createServer().listen(0, () => { console.log(s.address().port); s.close(); });",
])
  .toString()
  .trim();
const baseURL = `http://localhost:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `next dev --port ${process.env.E2E_PORT}`,
    url: baseURL,
    env: { NEXT_DIST_DIR: ".next-e2e" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
