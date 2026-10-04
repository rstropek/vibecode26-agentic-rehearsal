import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// Sindi's tracing: an errand over her A2A endpoint, in-process as in agent-card.test.ts, with a scripted model and a
// local stand-in for the dashboard's OTLP/HTTP receiver.

vi.mock("../src/mastra/agents/sindi-model", async () => {
  const { MastraLanguageModelV2Mock } = await import(
    "@mastra/core/test-utils/llm-mock"
  );
  return {
    // message/send runs the agent with generate.
    sindiModel: new MastraLanguageModelV2Mock({
      doGenerate: async () => ({
        content: [{ type: "text", text: "Woof!" }],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        warnings: [],
      }),
    }),
  };
});

type Received = { path?: string; contentType?: string; body: Buffer };
const received: Received[] = [];
let collector: Server;

beforeAll(async () => {
  collector = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        path: request.url,
        contentType: request.headers["content-type"],
        body: Buffer.concat(chunks),
      });
      response.writeHead(200).end();
    });
  });
  await new Promise<void>((resolve) => collector.listen(0, resolve));
  const { port } = collector.address() as AddressInfo;
  vi.stubEnv("SINDI_DATABASE_URL", ":memory:");
  // src/mastra/index.ts reads the endpoint on import.
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `http://localhost:${port}`);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => collector?.close(resolve));
});

test("exports an errand's spans for service sindi over OTLP/HTTP protobuf", async () => {
  const { createHonoServer } = await import("@mastra/deployer/server");
  const { mastra } = await import("../src/mastra/index");
  const app = await createHonoServer(mastra, { tools: {} });

  const response = await app.request("http://localhost:4111/api/a2a/sindi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "message/send",
      params: {
        message: {
          kind: "message",
          role: "user",
          messageId: "m-1",
          parts: [{ kind: "text", text: "Fetch the ball." }],
        },
      },
    }),
  });
  expect(await response.json()).toMatchObject({
    result: { status: { state: "completed" } },
  });
  // Flushes the exporter's batch, which otherwise waits five seconds.
  await mastra.shutdown();

  expect(received.length).toBeGreaterThan(0);
  for (const request of received) {
    expect(request.path).toBe("/v1/traces");
    expect(request.contentType).toBe("application/x-protobuf");
  }
  // Protobuf keeps strings as plain UTF-8, so the service name and span names are readable in the raw bodies.
  const sent = Buffer.concat(received.map((r) => r.body)).toString("utf8");
  expect(sent).toContain("sindi");
  expect(sent).toContain("invoke_agent Sindi");
  expect(sent).toContain("Fetch the ball.");
});
