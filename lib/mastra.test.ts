// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { user } from "@/db/schema";

// Lissie's tracing through the real Mastra instance, against a local stand-in for the dashboard's OTLP/HTTP receiver.
// A scripted model calls listTodos once and then answers, so one run has agent, model, and tool spans.

vi.mock("@/lib/lissie-model", async () => {
  const { MastraLanguageModelV2Mock } = await import(
    "@mastra/core/test-utils/llm-mock"
  );
  return {
    lissieModel: new MastraLanguageModelV2Mock({
      doStream: async ({ prompt }) => {
        const afterTool = prompt.at(-1)?.role === "tool";
        const parts = [
          { type: "stream-start" as const, warnings: [] },
          afterTool
            ? [
                { type: "text-start" as const, id: "text-1" },
                { type: "text-delta" as const, id: "text-1", delta: "Meow." },
                { type: "text-end" as const, id: "text-1" },
              ]
            : [
                {
                  type: "tool-call" as const,
                  toolCallId: "call-1",
                  toolName: "listTodos",
                  input: "{}",
                },
              ],
          {
            type: "finish" as const,
            finishReason: afterTool
              ? ("stop" as const)
              : ("tool-calls" as const),
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          },
        ].flat();
        return {
          stream: new ReadableStream({
            start(controller) {
              for (const part of parts) controller.enqueue(part);
              controller.close();
            },
          }),
        };
      },
    }),
  };
});

type Received = { path?: string; contentType?: string; body: Buffer };

const dir = mkdtempSync(join(tmpdir(), "todo-cat-mastra-test-"));
const received: Received[] = [];
let collector: Server;
let db: typeof import("./db").db;

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
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  ({ db } = await import("./db"));
  await migrate(db, { migrationsFolder: "db/migrations" });
  await db
    .insert(user)
    .values({ id: "user-alice", name: "Alice", email: "alice@example.com" });
  // lib/mastra.ts reads the endpoint on import.
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `http://localhost:${port}`);
});

afterAll(async () => {
  db?.$client.close();
  vi.unstubAllEnvs();
  await new Promise((resolve) => collector?.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

describe("lissieObservability", () => {
  test("is off without an endpoint", async () => {
    const { lissieObservability } = await import("./mastra");
    expect(lissieObservability("")).toBeUndefined();
    expect(lissieObservability("  ")).toBeUndefined();
  });
});

describe("a run of Lissie", () => {
  test("exports agent, model, and tool spans for service todo-cat over OTLP/HTTP protobuf", async () => {
    const { mastra, lissieAgent } = await import("./mastra");
    const { lissieRequestContext, lissieThreadId } = await import("./lissie");

    // Streams, like the CopilotKit bridge does.
    const run = await lissieAgent.stream("What is on my list?", {
      requestContext: lissieRequestContext("user-alice"),
      memory: { thread: lissieThreadId("user-alice"), resource: "user-alice" },
    });
    expect(await run.text).toBe("Meow.");
    // Flushes the exporter's batch, which otherwise waits five seconds.
    await mastra.shutdown();

    expect(received.length).toBeGreaterThan(0);
    for (const request of received) {
      expect(request.path).toBe("/v1/traces");
      expect(request.contentType).toBe("application/x-protobuf");
    }
    // Protobuf keeps strings as plain UTF-8, so span names and attributes are readable in the raw bodies.
    const sent = Buffer.concat(received.map((r) => r.body)).toString("utf8");
    expect(sent).toContain("todo-cat");
    expect(sent).toContain("invoke_agent Lissie");
    expect(sent).toContain("execute_tool listTodos");
    expect(sent).toMatch(/chat [\w-]+/);
  });
});
