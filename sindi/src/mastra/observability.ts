import { MastraStorageExporter, Observability } from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";

// Sindi's traces: always to her own storage, shown in Studio, and to the same OTLP collector as the web app's (the
// Aspire dashboard in development) when OTEL_EXPORTER_OTLP_ENDPOINT names one, under service name `sindi`. Her dev
// script reads it from the web app's .env; see tech-docs/a2a.md.
export function sindiObservability(
  setting = process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
): Observability {
  const endpoint = setting?.trim();
  return new Observability({
    configs: {
      default: {
        serviceName: "sindi",
        exporters: [
          new MastraStorageExporter(),
          ...(endpoint
            ? [
                new OtelExporter({
                  provider: {
                    custom: { endpoint, protocol: "http/protobuf" },
                  },
                  // Traces only, as in the web app (lib/mastra.ts).
                  signals: { logs: false },
                }),
              ]
            : []),
        ],
      },
    },
  });
}
