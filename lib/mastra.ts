import "server-only";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { Observability } from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";
import { db } from "@/lib/db";
import { LISSIE_AGENT_ID, lissie } from "@/lib/lissie";

// The Mastra instance Lissie runs in, which is where her traces come from; see tech-docs/observability.md.

const OTEL_SERVICE_NAME = "todo-cat";

// Traces go to an OTLP collector over HTTP/protobuf (the Aspire dashboard in development) when
// OTEL_EXPORTER_OTLP_ENDPOINT names one, e.g. http://localhost:4318; the exporter appends /v1/traces.
// Unset or empty means no tracing at all, which is how tests and CI run.
export function lissieObservability(
  setting = process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
): Observability | undefined {
  const endpoint = setting?.trim();
  if (!endpoint) return undefined;
  return new Observability({
    configs: {
      otel: {
        serviceName: OTEL_SERVICE_NAME,
        exporters: [
          new OtelExporter({
            provider: { custom: { endpoint, protocol: "http/protobuf" } },
            // Traces only: the logs signal would need its own OTLP log exporter package.
            signals: { logs: false },
          }),
        ],
      },
    },
  });
}

// Registering Lissie here hands her this instance's observability; the runtime takes her from here
// (lib/copilot-runtime.ts), so no run starts on an unregistered agent.
// Its storage is the same mastra_* tables on Drizzle's client as Lissie's memory, which keeps its own store; without
// one, Mastra falls back to an in-memory store and warns on every start.
export const mastra = new Mastra({
  agents: { [LISSIE_AGENT_ID]: lissie },
  storage: new LibSQLStore({ id: "mastra", client: db.$client }),
  observability: lissieObservability(),
});

export const lissieAgent = mastra.getAgent(LISSIE_AGENT_ID);
