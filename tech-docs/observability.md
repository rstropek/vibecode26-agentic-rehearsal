# Observability

Lissie's runs are traced with Mastra's observability and exported over OTLP/HTTP protobuf, in development to a local Aspire dashboard.
Sindi (`sindi/`) exports to the same endpoint as service `sindi`; see [a2a.md](a2a.md).

```
 Agent `lissie` ──registered in──▶ Mastra instance (lib/mastra.ts) ──▶ Observability ──▶ OtelExporter ──▶ POST <endpoint>/v1/traces
                                    service.name todo-cat              (custom provider,    (protobuf)        Aspire dashboard, UI on :18888
                                                                        http/protobuf)
```

## Central files

- `lib/mastra.ts`: the Mastra instance Lissie is registered in, `lissieObservability`, and `lissieAgent`, the registered agent the CopilotKit runtime serves.
- `lib/mastra.test.ts`: a scripted run against a local stand-in for the OTLP receiver.
- `next.config.ts`: `serverExternalPackages` for the exporter.

## Running it

- `npm run dashboard:start` starts `mcr.microsoft.com/dotnet/aspire-dashboard:13.5.2` in Docker as container `todo-cat-dashboard`: UI on http://localhost:18888 without login, OTLP/gRPC on 4317, OTLP/HTTP on 4318.
- `npm run dashboard:stop` stops and removes it; the dashboard keeps telemetry in memory only, so a restart starts empty.
- With `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `.env` (the `.env.example` default), every chat turn shows up under Traces as resource `todo-cat`.
- The dashboard's unsecured API returns the same data as JSON, which is handy for checking from a script: `curl 'http://localhost:18888/api/telemetry/traces?resource=todo-cat'`.
- Another checkout may already run a dashboard on these ports under a different container name; the app does not care which one receives the spans, so use it instead of stopping it.

## What a trace holds

- One trace per run, rooted at `invoke_agent Lissie`, with `model_generation <model>`, one `agent_step` per model step, `chat <model>` per model call (with token usage), `execute_tool <tool>` per tool call, and the memory and processor spans around them.
- The spans carry the inputs and outputs of the run, so the user's messages and todos reach the collector; Mastra's default `SensitiveDataFilter` redacts keys, tokens, and passwords before export.
- Span names and attributes follow OpenTelemetry's GenAI conventions, as converted by `@mastra/otel-exporter`.

## Design decisions

- Lissie is registered in a Mastra instance only because Mastra's observability lives on the instance; the agent definition in `lib/lissie.ts` is unchanged, and the runtime takes the agent from `lib/mastra.ts` so no run starts on an unregistered agent.
- Tracing is configured from `OTEL_EXPORTER_OTLP_ENDPOINT` alone: unset or empty means no `Observability` at all, set means traces go to `<endpoint>/v1/traces` (the exporter appends the path).
- The Vitest config and the e2e server set the variable to empty, so tests and CI export nothing although CI's `.env` comes from `.env.example`; an empty variable still wins over `.env` in Next.js.
- The custom provider with `http/protobuf` instead of a vendor provider, so any OTLP collector works; the logs signal is off, since it needs a separate OTLP log exporter package.
- The instance gets a `LibSQLStore` on Drizzle's client, the same `mastra_*` tables Lissie's memory uses; without storage Mastra falls back to an in-memory store and warns on every start, and memory keeps its own store either way.

## Gotchas

- `@mastra/otel-exporter` loads the OTLP exporter package with a computed `import()`, which a Turbopack bundle cannot resolve, and then logs that `@opentelemetry/exporter-trace-otlp-proto` "is not installed"; `serverExternalPackages` lets Node load it instead.
- `@opentelemetry/exporter-trace-otlp-proto` is a peer dependency of the exporter, pinned to the range it names (`0.218.x`), not the newest release.
- `@mastra/observability` and `@mastra/otel-exporter` are pinned to the versions released with `@mastra/core` 1.73/1.74 (1.18.3 and 1.4.4); move them together with `@mastra/core`.
- With the endpoint set and no collector listening, runs work as usual and the exporter drops the spans without logging.
- Spans leave in batches every five seconds, so a trace shows up a few seconds after the run; `mastra.shutdown()` flushes, which the test uses.
