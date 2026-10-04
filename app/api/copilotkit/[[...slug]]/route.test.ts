// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryAgentRunner } from "@copilotkit/runtime/v2";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// Lissie answers from a script instead of calling OpenRouter; the headers and tool names of each model call are kept.
// "Add <title>" makes her call addTodo, "How am I doing?" showProgress and listTodos in one step, a tool result makes
// her comment on it, and anything else gets "Meow.".
const modelCallHeaders = vi.hoisted(() => [] as unknown[]);
const modelCallTools = vi.hoisted(() => [] as string[][]);
vi.mock("@/lib/lissie-model", async () => {
  const { MastraLanguageModelV2Mock } = await import(
    "@mastra/core/test-utils/llm-mock"
  );
  return {
    lissieModel: new MastraLanguageModelV2Mock({
      doStream: async ({ prompt, headers, tools }) => {
        modelCallHeaders.push(headers);
        modelCallTools.push((tools ?? []).map((tool) => tool.name));
        const last = prompt.at(-1);
        const said = (
          last?.role === "user"
            ? last.content.flatMap((p) => (p.type === "text" ? [p.text] : []))
            : []
        ).join("");
        const title = /^Add (.+)$/.exec(said)?.[1];
        const toolCalls = title
          ? [{ toolName: "addTodo", input: { title } }]
          : said === "How am I doing?"
            ? [
                { toolName: "showProgress", input: {} },
                { toolName: "listTodos", input: {} },
              ]
            : [];
        const reply =
          last?.role === "tool" ? "Milk. For a human. Fine." : "Meow.";
        const parts = [
          { type: "stream-start" as const, warnings: [] },
          toolCalls.length > 0
            ? toolCalls.map((toolCall) => ({
                type: "tool-call" as const,
                toolCallId: `call-${crypto.randomUUID()}`,
                toolName: toolCall.toolName,
                input: JSON.stringify(toolCall.input),
              }))
            : [
                { type: "text-start" as const, id: "text-1" },
                { type: "text-delta" as const, id: "text-1", delta: reply },
                { type: "text-end" as const, id: "text-1" },
              ],
          {
            type: "finish" as const,
            finishReason:
              toolCalls.length > 0
                ? ("tool-calls" as const)
                : ("stop" as const),
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

const dir = mkdtempSync(join(tmpdir(), "todo-cat-copilotkit-test-"));
const base = "http://localhost:3000/api";
let db: typeof import("@/lib/db").db;
let authRoute: typeof import("../../auth/[...all]/route");
let route: typeof import("./route");
let lissieThreadId: typeof import("@/lib/lissie").lissieThreadId;
let lissie: typeof import("@/lib/lissie").lissie;

type User = { id: string; token: string; thread: string };
let alice: User;
let bob: User;

beforeAll(async () => {
  // lib/db.ts and Better Auth read these on import, so set them before importing the route modules.
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-secret-that-is-at-least-32-characters-long",
  );
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("COPILOTKIT_TELEMETRY_DISABLED", "true");
  ({ db } = await import("@/lib/db"));
  authRoute = await import("../../auth/[...all]/route");
  route = await import("./route");
  ({ lissieThreadId, lissie } = await import("@/lib/lissie"));
  await migrate(db, { migrationsFolder: "db/migrations" });
  alice = await signUp("Alice");
  bob = await signUp("Bob");
});

afterAll(() => {
  new InMemoryAgentRunner().clearThreads();
  db?.$client.close();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

// Signs up through the real Better Auth route, like a client would.
async function signUp(name: string): Promise<User> {
  const response = await authRoute.POST(
    new Request(`${base}/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email: `${name.toLowerCase()}@example.com`,
        password: "correct-horse-battery",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const { token, user } = await response.json();
  return { id: user.id, token, thread: lissieThreadId(user.id) };
}

function call(
  user: User | null,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers = new Headers();
  if (user) headers.set("authorization", `Bearer ${user.token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return route[method](
    new Request(`${base}/copilotkit${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

// An AG-UI RunAgentInput for a run or connect on `threadId`.
function runInput(threadId: string, text = "What should I do first?") {
  return {
    threadId,
    runId: crypto.randomUUID(),
    messages: [{ id: crypto.randomUUID(), role: "user", content: text }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

type AgUiEvent = { type: string; [key: string]: unknown };

// Reads an SSE response to the end and returns its AG-UI events.
async function events(response: Response): Promise<AgUiEvent[]> {
  expect(response.status).toBe(200);
  return (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

// Every route the runtime serves (RouteInfo in @copilotkit/runtime/v2), with a body it would accept.
// `thread` is the thread the request names, if any.
function everyRoute(
  thread: string,
): [string, "GET" | "POST", string, unknown?][] {
  return [
    ["info", "GET", "/info"],
    ["agent/run", "POST", "/agent/lissie/run", runInput(thread)],
    ["agent/connect", "POST", "/agent/lissie/connect", runInput(thread)],
    ["agent/suggest", "POST", "/agent/lissie/suggest", runInput(thread)],
    ["agent/stop", "POST", `/agent/lissie/stop/${thread}`, {}],
    ["trajectory/connect", "POST", "/trajectory/some-trajectory/connect", {}],
    ["inspector/metadata", "GET", "/inspector-metadata"],
    ["inspector/learning", "GET", "/inspector-learning"],
    ["transcribe", "POST", "/transcribe", {}],
    ["threads/list", "GET", "/threads"],
    ["threads/subscribe", "POST", "/threads/subscribe", {}],
    ["threads/archive", "POST", `/threads/${thread}/archive`, {}],
    ["threads/messages", "GET", `/threads/${thread}/messages`],
    ["threads/events", "GET", `/threads/${thread}/events`],
    ["threads/state", "GET", `/threads/${thread}/state`],
    ["threads/clear", "POST", "/threads/clear", {}],
    ["memories/list", "GET", "/memories"],
    ["memories/recall", "POST", "/memories/recall", {}],
    ["annotate", "POST", "/annotate", {}],
    ["cpk-debug-events", "GET", "/cpk-debug-events"],
  ];
}

describe("without a session", () => {
  test.each(
    everyRoute("lissie-anyone"),
  )("%s answers 401", async (_name, method, path, body) => {
    const response = await call(null, method, path, body);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("an invalid bearer token is no session", async () => {
    const stranger = { id: "x", token: "not-a-session", thread: "x" };
    expect((await call(stranger, "GET", "/info")).status).toBe(401);
  });
});

describe("routes the chat does not use", () => {
  const used = new Set(["info", "agent/run", "agent/connect", "agent/stop"]);

  // Signed in and naming their own thread, so only the route itself can be refused.
  test("are all refused, even on the user's own thread", async () => {
    for (const [name, method, path, body] of everyRoute(alice.thread)) {
      if (used.has(name)) continue;
      const response = await call(alice, method, path, body);
      expect(response.status, name).toBe(404);
    }
  });

  test("info lists only Lissie", async () => {
    const response = await call(alice, "GET", "/info");
    expect(response.status).toBe(200);
    expect(Object.keys((await response.json()).agents)).toEqual(["lissie"]);
  });

  test("other agent ids are not found", async () => {
    const response = await call(
      alice,
      "POST",
      "/agent/default/run",
      runInput(alice.thread),
    );
    expect(response.status).toBe(404);
  });
});

describe("another user's thread", () => {
  test("can't be run on", async () => {
    const response = await call(
      bob,
      "POST",
      "/agent/lissie/run",
      runInput(alice.thread, "Tell me Alice's secrets."),
    );
    expect(response.status).toBe(404);
  });

  test("can't be reconnected to", async () => {
    const response = await call(
      bob,
      "POST",
      "/agent/lissie/connect",
      runInput(alice.thread),
    );
    expect(response.status).toBe(404);
  });

  test("can't be stopped", async () => {
    const response = await call(
      bob,
      "POST",
      `/agent/lissie/stop/${alice.thread}`,
      {},
    );
    expect(response.status).toBe(404);
  });

  test("can't be read through the thread routes", async () => {
    for (const path of ["messages", "events", "state"]) {
      const response = await call(
        bob,
        "GET",
        `/threads/${alice.thread}/${path}`,
      );
      expect(response.status, path).toBe(404);
    }
  });

  test("a run or connect without a thread id is refused", async () => {
    const { threadId: _threadId, ...input } = runInput(bob.thread);
    for (const path of ["/agent/lissie/run", "/agent/lissie/connect"]) {
      expect((await call(bob, "POST", path, input)).status, path).toBe(404);
    }
  });
});

describe("the user's own thread", () => {
  test("a run streams Lissie's reply and stores the turn in memory, scoped to the user", async () => {
    const run = await events(
      await call(alice, "POST", "/agent/lissie/run", runInput(alice.thread)),
    );
    expect(run.map((event) => event.type)).toContain("RUN_FINISHED");
    expect(
      run
        .filter((event) => event.type === "TEXT_MESSAGE_CONTENT")
        .map((event) => event.delta)
        .join(""),
    ).toBe("Meow.");

    // The runtime forwards no request headers to the model: the bearer session token must not reach OpenRouter.
    expect(modelCallHeaders).toHaveLength(1);
    expect(JSON.stringify(modelCallHeaders[0] ?? {})).not.toContain(
      alice.token,
    );

    const memory = await lissie.getMemory();
    const thread = await memory?.getThreadById({ threadId: alice.thread });
    expect(thread?.resourceId).toBe(alice.id);
    const { threads } = (await memory?.listThreads({
      filter: { resourceId: alice.id },
    })) ?? { threads: [] };
    expect(threads.map((t) => t.id)).toEqual([alice.thread]);
  });

  test("connect replays the conversation from memory after a restart", async () => {
    // A restart loses the runner's in-memory threads; Mastra memory in SQLite is what remains.
    new InMemoryAgentRunner().clearThreads();

    const replay = await events(
      await call(
        alice,
        "POST",
        "/agent/lissie/connect",
        runInput(alice.thread),
      ),
    );
    const snapshot = replay.find((event) => event.type === "MESSAGES_SNAPSHOT");
    expect(snapshot?.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "What should I do first?",
      }),
      expect.objectContaining({ role: "assistant", content: "Meow." }),
    ]);
  });

  test("another user's own thread holds none of it", async () => {
    const replay = await events(
      await call(bob, "POST", "/agent/lissie/connect", runInput(bob.thread)),
    );
    expect(replay).toEqual([]);
  });

  test("stop answers for the user's own thread", async () => {
    const response = await call(
      alice,
      "POST",
      `/agent/lissie/stop/${alice.thread}`,
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stopped: false });
  });
});

describe("Lissie's tools", () => {
  let carol: User;
  let live: AgUiEvent[];

  beforeAll(async () => {
    carol = await signUp("Carol");
    live = await events(
      await call(
        carol,
        "POST",
        "/agent/lissie/run",
        runInput(carol.thread, "Add buy milk"),
      ),
    );
  });

  test("act for the signed-in user from the session, and only for them", async () => {
    const service = await import("@/lib/todo-service");
    const start = live.find((event) => event.type === "TOOL_CALL_START");
    expect(start).toMatchObject({ toolCallName: "addTodo" });
    const result = live.find((event) => event.type === "TOOL_CALL_RESULT");
    expect(JSON.parse(String(result?.content))).toMatchObject({
      todo: { title: "buy milk", done: false },
    });

    expect(await service.listTodos(carol.id)).toEqual([
      expect.objectContaining({ title: "buy milk" }),
    ]);
    expect(
      (await service.listTodos(bob.id)).map((todo) => todo.title),
    ).not.toContain("buy milk");
  });

  test("calls survive a restart: replay rebuilds the messages the live run streamed, with the same ids", async () => {
    new InMemoryAgentRunner().clearThreads();
    const replay = await events(
      await call(
        carol,
        "POST",
        "/agent/lissie/connect",
        runInput(carol.thread),
      ),
    );
    const snapshot = replay.find((event) => event.type === "MESSAGES_SNAPSHOT");

    const start = live.find((event) => event.type === "TOOL_CALL_START");
    const comment = live.find((event) => event.type === "TEXT_MESSAGE_START");
    expect(snapshot?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "Add buy milk" }),
      expect.objectContaining({
        id: start?.parentMessageId,
        role: "assistant",
        toolCalls: [
          {
            id: start?.toolCallId,
            type: "function",
            function: {
              name: "addTodo",
              arguments: JSON.stringify({ title: "buy milk" }),
            },
          },
        ],
      }),
      expect.objectContaining({
        role: "tool",
        toolCallId: start?.toolCallId,
        content: expect.stringContaining('"title":"buy milk"'),
      }),
      expect.objectContaining({
        id: comment?.messageId,
        role: "assistant",
        content: "Milk. For a human. Fine.",
      }),
    ]);
  });

  test("the next turn sends replayed history back without storing it twice or rerunning the tool", async () => {
    const service = await import("@/lib/todo-service");
    const memory = await lissie.getMemory();
    const stored = async () =>
      (
        await memory?.recall({
          threadId: carol.thread,
          resourceId: carol.id,
          perPage: false,
        })
      )?.messages.length;
    const before = await stored();
    const replay = await events(
      await call(
        carol,
        "POST",
        "/agent/lissie/connect",
        runInput(carol.thread),
      ),
    );
    const history = replay.find(
      (event) => event.type === "MESSAGES_SNAPSHOT",
    )?.messages;

    const next = runInput(carol.thread, "What next?");
    await events(
      await call(carol, "POST", "/agent/lissie/run", {
        ...next,
        messages: [...(history as unknown[]), ...next.messages],
      }),
    );

    expect(await stored()).toBe((before ?? 0) + 2);
    expect(await service.listTodos(carol.id)).toHaveLength(1);
  });
});

describe("the progress card", () => {
  let dave: User;
  let live: AgUiEvent[];
  let tools: string[] | undefined;

  beforeAll(async () => {
    dave = await signUp("Dave");
    const service = await import("@/lib/todo-service");
    const milk = await service.addTodo(dave.id, { title: "Buy milk" });
    await service.addTodo(dave.id, { title: "Feed the cat" });
    await service.updateTodo(dave.id, milk.id, { done: true });
    const calls = modelCallTools.length;
    // What the chat sends with its catalog, plus a request for the generating tool, which the runtime must refuse.
    live = await events(
      await call(dave, "POST", "/agent/lissie/run", {
        ...runInput(dave.thread, "How am I doing?"),
        forwardedProps: { a2uiCatalogAvailable: true, injectA2UITool: true },
      }),
    );
    tools = modelCallTools[calls];
  });

  test("the model gets Lissie's tools and nothing that generates UI", () => {
    expect(tools?.toSorted()).toEqual([
      "addTodo",
      "listTodos",
      "setTodoDone",
      "showProgress",
    ]);
  });

  // listTodos runs in the same step and starts after showProgress, which made the runtime's A2UI middleware name the
  // surface after listTodos's call.
  test("showProgress's result paints an A2UI surface with the user's numbers, named after its own call", () => {
    const starts = live.filter((event) => event.type === "TOOL_CALL_START");
    expect(starts.map((event) => event.toolCallName)).toEqual([
      "showProgress",
      "listTodos",
    ]);
    const surfaces = live.filter((event) => event.type === "ACTIVITY_SNAPSHOT");
    expect(surfaces).toEqual([
      expect.objectContaining({
        messageId: `a2ui-surface-${starts[0]?.toolCallId}`,
        activityType: "a2ui-surface",
        content: {
          a2ui_operations: expect.arrayContaining([
            expect.objectContaining({
              updateDataModel: expect.objectContaining({
                value: { total: 2, done: 1, open: 1 },
              }),
            }),
          ]),
        },
      }),
    ]);
  });

  test("survives a restart: replay puts the same surface after the result, and the next turn accepts it", async () => {
    new InMemoryAgentRunner().clearThreads();
    const replay = await events(
      await call(dave, "POST", "/agent/lissie/connect", runInput(dave.thread)),
    );
    const history = replay.find(
      (event) => event.type === "MESSAGES_SNAPSHOT",
    )?.messages;

    const surface = live.find((event) => event.type === "ACTIVITY_SNAPSHOT");
    expect(history).toEqual([
      expect.objectContaining({ role: "user", content: "How am I doing?" }),
      expect.objectContaining({ role: "assistant" }),
      expect.objectContaining({ role: "tool" }),
      {
        id: surface?.messageId,
        role: "activity",
        activityType: "a2ui-surface",
        content: surface?.content,
      },
      expect.objectContaining({ role: "tool" }),
      expect.objectContaining({ role: "assistant" }),
    ]);

    const next = runInput(dave.thread, "What next?");
    const run = await events(
      await call(dave, "POST", "/agent/lissie/run", {
        ...next,
        messages: [...(history as unknown[]), ...next.messages],
      }),
    );
    expect(run.map((event) => event.type)).toContain("RUN_FINISHED");
  });
});
