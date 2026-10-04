// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryAgentRunner } from "@copilotkit/runtime/v2";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// Lissie answers with a canned reply instead of calling OpenRouter; the headers of each model call are kept.
const modelCallHeaders = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/lissie-model", async () => {
  const { createMockModel } = await import("@mastra/core/test-utils/llm-mock");
  return {
    lissieModel: createMockModel({
      mockText: "Meow.",
      version: "v2",
      spyStream: (call: { headers?: unknown }) =>
        modelCallHeaders.push(call.headers),
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
