import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests never export traces, whatever the shell sets (src/mastra/observability.ts).
    env: { OTEL_EXPORTER_OTLP_ENDPOINT: "" },
  },
});
