import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    // .claude/worktrees/ holds other checkouts of this repo (gitignored, but Vitest does not read .gitignore).
    exclude: ["**/node_modules/**", "e2e/**", ".claude/worktrees/**"],
    setupFiles: ["./vitest.setup.ts"],
    // Tests never export traces, whatever the shell sets (lib/mastra.ts).
    env: { OTEL_EXPORTER_OTLP_ENDPOINT: "" },
  },
});
