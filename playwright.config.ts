import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Everything the e2e server shares with other processes is overridable, so it never collides with
// `npm run dev` or another checkout. Workers re-evaluate this file and inherit the env vars set here.
process.env.E2E_PORT ||= execFileSync(process.execPath, [
  "-e",
  "const s = require('node:net').createServer().listen(0, () => { console.log(s.address().port); s.close(); });",
])
  .toString()
  .trim();
process.env.E2E_DIST_DIR ||= ".next-e2e";
process.env.E2E_DATABASE_URL ||= `file:${join(tmpdir(), `todo-cat-e2e-${process.env.E2E_PORT}-${Date.now()}.db`)}`;
const baseURL = `http://localhost:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // *.model.spec.ts calls the real model; only `npm run test:e2e:model` (E2E_MODEL=1) runs it, never QA or CI.
  testIgnore: process.env.E2E_MODEL ? [] : ["**/*.model.spec.ts"],
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
    // Migrates the fresh e2e database before the server starts; the env vars below win over .env.
    command: `drizzle-kit migrate && next dev --port ${process.env.E2E_PORT}`,
    url: baseURL,
    env: {
      NEXT_DIST_DIR: process.env.E2E_DIST_DIR,
      DATABASE_URL: process.env.E2E_DATABASE_URL,
      BETTER_AUTH_URL: baseURL,
      COPILOTKIT_TELEMETRY_DISABLED: "true",
      // Empty turns Lissie's tracing off (lib/mastra.ts); an empty variable still wins over .env.
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
