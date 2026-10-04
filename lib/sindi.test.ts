// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

// Lissie's subagent Sindi against a stub A2A server that answers like Sindi's Mastra app (sindi/), and a scripted model:
// no Sindi, no OpenRouter. "Ask Sindi to fetch the ball" makes Lissie call agent-sindi with the errand and, to test
// that only the errand leaves, instructions about the user's list; a tool result makes her repeat it, so the test sees
// what reached the model.

const ERRAND = "Fetch the ball.";

type ModelCall = {
  tools: { name: string; description?: string }[];
  toolResult?: { type: string; value: unknown };
};
const modelCalls = vi.hoisted(() => [] as ModelCall[]);
vi.mock("@/lib/lissie-model", async () => {
  const { MastraLanguageModelV2Mock } = await import(
    "@mastra/core/test-utils/llm-mock"
  );
  return {
    lissieModel: new MastraLanguageModelV2Mock({
      doStream: async ({ prompt, tools }) => {
        const last = prompt.at(-1);
        const toolResult =
          last?.role === "tool"
            ? last.content.find((part) => part.type === "tool-result")?.output
            : undefined;
        modelCalls.push({
          tools: (tools ?? []).map((tool) => ({
            name: tool.name,
            description:
              tool.type === "function" ? tool.description : undefined,
          })),
          toolResult,
        });
        const asked =
          last?.role === "user" &&
          last.content.some(
            (part) =>
              part.type === "text" && part.text.includes("fetch the ball"),
          );
        const reply = toolResult
          ? `Sindi: ${JSON.stringify(toolResult.value)}`
          : "Meow.";
        const parts = [
          { type: "stream-start" as const, warnings: [] },
          asked
            ? [
                {
                  type: "tool-call" as const,
                  toolCallId: `call-${crypto.randomUUID()}`,
                  toolName: "agent-sindi",
                  input: JSON.stringify({
                    prompt: ERRAND,
                    instructions: "The user still has to call the notary.",
                  }),
                },
              ]
            : [
                { type: "text-start" as const, id: "text-1" },
                { type: "text-delta" as const, id: "text-1", delta: reply },
                { type: "text-end" as const, id: "text-1" },
              ],
          {
            type: "finish" as const,
            finishReason: asked ? ("tool-calls" as const) : ("stop" as const),
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

const SINDI_REPLY = "Got the ball! Brought it right back. Again?";

// What the stub received: the card fetch and every JSON-RPC call.
type StubRequest = { method?: string; url?: string; body?: unknown };
const stubRequests: StubRequest[] = [];

// Answers like Mastra's A2A server for agent `sindi`: the card at its well-known path, and `message/send` and
// `message/stream` with a completed task whose artifact holds her reply.
function startStubSindi(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    stubRequests.push({ method: request.method, url: request.url, body });

    if (
      request.method === "GET" &&
      request.url === "/api/.well-known/sindi/agent-card.json"
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          protocolVersion: "0.3.0",
          name: "sindi",
          description: "You are Sindi, the dog next door.",
          url: `${origin}/api/a2a/sindi`,
          version: "1.0",
          capabilities: { streaming: true, pushNotifications: true },
          defaultInputModes: ["text/plain"],
          defaultOutputModes: ["text/plain"],
          skills: [],
        }),
      );
      return;
    }
    if (request.method === "POST" && request.url === "/api/a2a/sindi") {
      const task = {
        kind: "task",
        id: "task-1",
        contextId: "context-1",
        status: { state: "completed", timestamp: new Date().toISOString() },
        artifacts: [
          {
            artifactId: "task-1:response",
            parts: [{ kind: "text", text: SINDI_REPLY }],
          },
        ],
      };
      const result = { jsonrpc: "2.0", id: body.id, result: task };
      if (body.method === "message/stream") {
        response.setHeader("content-type", "text/event-stream");
        response.end(`data: ${JSON.stringify(result)}\n\n`);
      } else {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(result));
      }
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server)),
  );
}

function urlOf(server: Server): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const dir = mkdtempSync(join(tmpdir(), "todo-cat-sindi-test-"));
let stub: Server;
let closeDb: (() => void) | undefined;

beforeAll(async () => {
  // lib/db.ts reads DATABASE_URL on import; Mastra memory keeps Lissie's thread there.
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  stub = await startStubSindi();
});

afterEach(() => {
  modelCalls.length = 0;
  stubRequests.length = 0;
});

afterAll(() => {
  stub?.close();
  closeDb?.();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

// A fresh Lissie whose Sindi lives at `sindiUrl`, because lib/sindi.ts reads SINDI_URL on import and the A2A agent
// caches the card it fetched.
async function lissieWithSindiAt(sindiUrl: string) {
  vi.stubEnv("SINDI_URL", sindiUrl);
  vi.resetModules();
  const { db } = await import("@/lib/db");
  closeDb?.();
  closeDb = () => db.$client.close();
  return import("@/lib/lissie");
}

// One chat turn as the runtime runs it: streamed, for the user from the session.
async function ask(
  {
    lissie,
    lissieRequestContext,
  }: Awaited<ReturnType<typeof lissieWithSindiAt>>,
  said: string,
): Promise<string> {
  const output = await lissie.stream(said, {
    requestContext: lissieRequestContext("user-alice"),
  });
  return output.text;
}

test("offers Sindi to the model as the agent-sindi tool", async () => {
  const lissie = await lissieWithSindiAt(urlOf(stub));

  await ask(lissie, "Hello");

  expect(modelCalls[0].tools).toContainEqual({
    name: "agent-sindi",
    description: expect.stringContaining("the dog next door"),
  });
  expect(stubRequests).toEqual([]);
});

test("delegates an errand to Sindi over A2A and hears her reply", async () => {
  const lissie = await lissieWithSindiAt(urlOf(stub));

  const reply = await ask(lissie, "Ask Sindi to fetch the ball");

  expect(stubRequests.map(({ method, url }) => `${method} ${url}`)).toEqual([
    "GET /api/.well-known/sindi/agent-card.json",
    "POST /api/a2a/sindi",
  ]);
  const call = stubRequests[1].body as {
    method: string;
    params: { message: { role: string; parts: { text: string }[] } };
  };
  expect(call.method).toBe("message/stream");
  expect(call.params.message.role).toBe("user");
  expect(call.params.message.parts[0].text).toContain(ERRAND);
  expect(modelCalls[1].toolResult).toEqual({
    type: "text",
    value: SINDI_REPLY,
  });
  expect(reply).toContain(SINDI_REPLY);
});

test("sends Sindi the errand and nothing else", async () => {
  const lissie = await lissieWithSindiAt(urlOf(stub));
  await ask(lissie, "Put 'call the notary about the will' on my list");
  stubRequests.length = 0;

  await ask(lissie, "Ask Sindi to fetch the ball");

  const call = stubRequests.find(({ method }) => method === "POST")?.body as {
    params: { message: { parts: unknown[] } };
  };
  // A2AAgent prefixes each message with its role. Without the boundary, "Instructions:" and "Context:" blocks with
  // the model's instructions and this conversation would come first.
  expect(call.params.message.parts).toEqual([
    { kind: "text", text: `user: ${ERRAND}` },
  ]);
  const sent = JSON.stringify(stubRequests);
  for (const leak of ["notary", "Meow", "Ask Sindi", "user-alice", "lissie-"]) {
    expect(sent).not.toContain(leak);
  }
});

test("tells the model when Sindi is unreachable", async () => {
  // A port that was just free: nothing answers there.
  const gone = await startStubSindi();
  const goneUrl = urlOf(gone);
  await new Promise((resolve) => gone.close(resolve));
  const lissie = await lissieWithSindiAt(goneUrl);

  const reply = await ask(lissie, "Ask Sindi to fetch the ball");

  expect(modelCalls[0].tools.map((tool) => tool.name)).toContain("agent-sindi");
  expect(modelCalls[1].toolResult?.type).toMatch(/^error-/);
  expect(modelCalls[1].toolResult?.value).not.toContain(SINDI_REPLY);
  expect(reply).toMatch(/^Sindi: /);
  expect(stubRequests).toEqual([]);
});
