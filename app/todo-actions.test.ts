// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

// The page adapter's Server Actions on a temp database: they act for the session's user only, map the service's
// errors to messages, and refresh the page. Next.js request APIs are mocked; the session is a real Better Auth token.

const session = vi.hoisted(() => ({ token: null as string | null }));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      session.token ? { authorization: `Bearer ${session.token}` } : {},
    ),
}));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-actions-test-"));
let db: typeof import("@/lib/db").db;
let auth: typeof import("@/lib/auth").auth;
let service: typeof import("@/lib/todo-service");
let actions: typeof import("./todo-actions");

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-secret-that-is-at-least-32-characters-long",
  );
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ db } = await import("@/lib/db"));
  ({ auth } = await import("@/lib/auth"));
  service = await import("@/lib/todo-service");
  actions = await import("./todo-actions");
  await migrate(db, { migrationsFolder: "db/migrations" });
});

afterAll(() => {
  db?.$client.close();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  session.token = null;
  refresh.mockClear();
});

let users = 0;
async function signUp(): Promise<{ id: string; token: string }> {
  users += 1;
  const { user, token } = await auth.api.signUpEmail({
    body: {
      name: `Cat Person ${users}`,
      email: `cat-${users}@example.com`,
      password: "correct-horse-battery",
    },
  });
  if (!token) throw new Error("sign-up returned no session token");
  return { id: user.id, token };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

test("every action sends a visitor without a session to sign in", async () => {
  await expect(
    actions.addTodoAction({}, form({ title: "Nap", dueDate: "" })),
  ).rejects.toThrow("redirect /login");
  await expect(
    actions.setTodoDoneAction("00000000-0000-4000-8000-000000000000", true),
  ).rejects.toThrow("redirect /login");
  await expect(
    actions.deleteTodoAction("00000000-0000-4000-8000-000000000000"),
  ).rejects.toThrow("redirect /login");
});

test("adds, checks off, reopens, and deletes the session user's todo, refreshing the page each time", async () => {
  const me = await signUp();
  session.token = me.token;

  expect(
    await actions.addTodoAction(
      {},
      form({ title: "  Buy tuna ", dueDate: "2026-10-09" }),
    ),
  ).toEqual({});
  expect(
    await actions.addTodoAction({}, form({ title: "Nap", dueDate: "" })),
  ).toEqual({});
  const [tuna, nap] = await service.listTodos(me.id);
  expect(tuna).toMatchObject({ title: "Buy tuna", dueDate: "2026-10-09" });
  expect(nap).toMatchObject({ title: "Nap", dueDate: null });

  expect(await actions.setTodoDoneAction(tuna.id, true)).toEqual({});
  expect(await service.getTodo(me.id, tuna.id)).toMatchObject({ done: true });
  expect(await actions.setTodoDoneAction(tuna.id, false)).toEqual({});
  expect(await service.getTodo(me.id, tuna.id)).toMatchObject({ done: false });

  expect(await actions.deleteTodoAction(tuna.id)).toEqual({});
  expect(await service.listTodos(me.id)).toEqual([nap]);
  expect(refresh).toHaveBeenCalledTimes(5);
});

test("another user's todo is gone, not changed, and the list refreshes", async () => {
  const owner = await signUp();
  const other = await signUp();
  const todo = await service.addTodo(owner.id, { title: "Feed the cat" });
  session.token = other.token;

  for (const result of [
    await actions.setTodoDoneAction(todo.id, true),
    await actions.deleteTodoAction(todo.id),
  ]) {
    expect(result.error).toMatch(/gone already/);
  }
  expect(await service.getTodo(owner.id, todo.id)).toEqual(todo);
  expect(refresh).toHaveBeenCalledTimes(2);
});

test("invalid input returns a message and what was typed, and changes nothing", async () => {
  const me = await signUp();
  session.token = me.token;

  const state = await actions.addTodoAction(
    {},
    form({ title: "   ", dueDate: "2026-02-30" }),
  );
  expect(state).toEqual({
    error: expect.stringMatching(/needs a title/),
    title: "   ",
    dueDate: "2026-02-30",
  });
  expect((await actions.setTodoDoneAction("not-an-id", true)).error).toEqual(
    expect.any(String),
  );
  expect(await service.listTodos(me.id)).toEqual([]);
  expect(refresh).not.toHaveBeenCalled();
});
