// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  errorBodySchema,
  todoListSchema,
  todoSchema,
} from "@todo-cat/contract";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// Covers both route files: /api/todos and /api/todos/[id].
type Collection = typeof import("./route");
type Item = typeof import("./[id]/route");

const dir = mkdtempSync(join(tmpdir(), "todo-cat-rest-test-"));
const base = "http://localhost:3000/api";
const unknownId = "00000000-0000-4000-8000-000000000000";
let db: typeof import("@/lib/db").db;
let authRoute: typeof import("../auth/[...all]/route");
let collection: Collection;
let item: Item;

beforeAll(async () => {
  // lib/db.ts and Better Auth read these on import, so set them before importing the route modules.
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-secret-that-is-at-least-32-characters-long",
  );
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ db } = await import("@/lib/db"));
  authRoute = await import("../auth/[...all]/route");
  collection = await import("./route");
  item = await import("./[id]/route");
  await migrate(db, { migrationsFolder: "db/migrations" });
});

afterAll(() => {
  db?.$client.close();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

// Signs up through the real Better Auth route, like a client would, and returns the session token.
async function signUp(name: string): Promise<string> {
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
  const { token } = await response.json();
  expect(token).toEqual(expect.any(String));
  return token;
}

function request(
  token: string | null,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Request {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${base}/todos${path}`, {
    method: init.method ?? "GET",
    headers,
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Every endpoint, called with the given token; a valid body and id, so only the token can fail.
const endpoints: [string, (token: string | null) => Promise<Response>][] = [
  ["GET /api/todos", (token) => collection.GET(request(token, ""))],
  [
    "POST /api/todos",
    (token) =>
      collection.POST(
        request(token, "", { method: "POST", body: { title: "Nap" } }),
      ),
  ],
  [
    "GET /api/todos/:id",
    (token) => item.GET(request(token, `/${unknownId}`), context(unknownId)),
  ],
  [
    "PATCH /api/todos/:id",
    (token) =>
      item.PATCH(
        request(token, `/${unknownId}`, {
          method: "PATCH",
          body: { done: true },
        }),
        context(unknownId),
      ),
  ],
  [
    "DELETE /api/todos/:id",
    (token) =>
      item.DELETE(
        request(token, `/${unknownId}`, { method: "DELETE" }),
        context(unknownId),
      ),
  ],
];

async function expectError(
  response: Response,
  status: number,
  code: string,
): Promise<string> {
  expect(response.status).toBe(status);
  const body = errorBodySchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  return body.error.message;
}

describe("without a valid token", () => {
  test.each(endpoints)("%s answers 401 without a token", async (_, call) => {
    await expectError(await call(null), 401, "unauthorized");
  });

  test.each(
    endpoints,
  )("%s answers 401 with an invalid token", async (_, call) => {
    await expectError(await call("not-a-session"), 401, "unauthorized");
  });
});

describe("with a bearer token", () => {
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    alice = await signUp("Alice");
    bob = await signUp("Bob");
  });

  test("adds, lists, completes, filters, and deletes a todo", async () => {
    const created = await collection.POST(
      request(alice, "", {
        method: "POST",
        body: { title: "  Buy cat food ", dueDate: "2026-10-06" },
      }),
    );
    expect(created.status).toBe(201);
    const todo = todoSchema.parse(await created.json());
    expect(todo).toMatchObject({
      title: "Buy cat food",
      dueDate: "2026-10-06",
      done: false,
      completedAt: null,
    });
    await collection.POST(
      request(alice, "", { method: "POST", body: { title: "Brush Lissie" } }),
    );

    const listed = await collection.GET(request(alice, ""));
    expect(listed.status).toBe(200);
    expect(
      todoListSchema.parse(await listed.json()).map((t) => t.title),
    ).toEqual(["Buy cat food", "Brush Lissie"]);

    const fetched = await item.GET(
      request(alice, `/${todo.id}`),
      context(todo.id),
    );
    expect(fetched.status).toBe(200);
    expect(todoSchema.parse(await fetched.json())).toEqual(todo);

    const updated = await item.PATCH(
      request(alice, `/${todo.id}`, { method: "PATCH", body: { done: true } }),
      context(todo.id),
    );
    expect(updated.status).toBe(200);
    const done = todoSchema.parse(await updated.json());
    expect(done.done).toBe(true);
    expect(done.completedAt).toEqual(expect.any(String));

    const titles = async (query: string) => {
      const response = await collection.GET(request(alice, query));
      expect(response.status).toBe(200);
      return todoListSchema.parse(await response.json()).map((t) => t.title);
    };
    expect(await titles("?status=done")).toEqual(["Buy cat food"]);
    expect(await titles("?status=open")).toEqual(["Brush Lissie"]);
    expect(await titles("?search=CAT%20FOOD")).toEqual(["Buy cat food"]);
    expect(await titles("?status=open&search=food")).toEqual([]);

    const deleted = await item.DELETE(
      request(alice, `/${todo.id}`, { method: "DELETE" }),
      context(todo.id),
    );
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
    expect(await titles("")).toEqual(["Brush Lissie"]);
    await expectError(
      await item.GET(request(alice, `/${todo.id}`), context(todo.id)),
      404,
      "todo-not-found",
    );
  });

  test("answers 404 for another user's todo and leaves it alone", async () => {
    const created = await collection.POST(
      request(bob, "", { method: "POST", body: { title: "Bob's secret" } }),
    );
    const { id } = todoSchema.parse(await created.json());

    const attempts = [
      item.GET(request(alice, `/${id}`), context(id)),
      item.PATCH(
        request(alice, `/${id}`, { method: "PATCH", body: { title: "Mine" } }),
        context(id),
      ),
      item.DELETE(request(alice, `/${id}`, { method: "DELETE" }), context(id)),
    ];
    const messages = [];
    for (const response of await Promise.all(attempts)) {
      messages.push(await expectError(response, 404, "todo-not-found"));
    }

    // Identical to a missing id, so the response does not reveal that the id exists.
    const missing = await expectError(
      await item.GET(request(alice, `/${unknownId}`), context(unknownId)),
      404,
      "todo-not-found",
    );
    expect(messages).toEqual([missing, missing, missing]);
    const aliceTodos = todoListSchema.parse(
      await (await collection.GET(request(alice, ""))).json(),
    );
    expect(aliceTodos.map((t) => t.id)).not.toContain(id);

    const own = await item.GET(request(bob, `/${id}`), context(id));
    expect(todoSchema.parse(await own.json()).title).toBe("Bob's secret");
  });

  test("answers 404 for an id that is not a UUID", async () => {
    await expectError(
      await item.GET(request(alice, "/not-a-uuid"), context("not-a-uuid")),
      404,
      "todo-not-found",
    );
  });

  test.each([
    ["a blank title", { title: "  " }],
    ["a missing title", {}],
    ["an impossible due date", { title: "Nap", dueDate: "2026-02-30" }],
    ["a body that is not JSON", "{title:"],
  ])("POST answers 400 for %s", async (_, body) => {
    const response = await collection.POST(
      request(alice, "", { method: "POST", body }),
    );
    await expectError(response, 400, "validation-failed");
  });

  test("PATCH answers 400 for invalid input and changes nothing", async () => {
    const created = await collection.POST(
      request(alice, "", { method: "POST", body: { title: "Vet visit" } }),
    );
    const todo = todoSchema.parse(await created.json());

    const response = await item.PATCH(
      request(alice, `/${todo.id}`, {
        method: "PATCH",
        body: { title: "Vet", done: "yes" },
      }),
      context(todo.id),
    );
    await expectError(response, 400, "validation-failed");

    const fetched = await item.GET(
      request(alice, `/${todo.id}`),
      context(todo.id),
    );
    expect(todoSchema.parse(await fetched.json())).toEqual(todo);
  });

  test("GET answers 400 for an unknown status", async () => {
    const message = await expectError(
      await collection.GET(request(alice, "?status=later")),
      400,
      "validation-failed",
    );
    expect(message).toContain("status");
  });
});
