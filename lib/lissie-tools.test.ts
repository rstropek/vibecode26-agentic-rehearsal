// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequestContext } from "@mastra/core/request-context";
import { noopObserve } from "@mastra/core/tools";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { todos, user } from "@/db/schema";

// Lissie's tool executors against a temp database, with the request context the runtime builds from the session.
// Every case has two users: Alice's context must never reach Bob's todos.

const dir = mkdtempSync(join(tmpdir(), "todo-cat-lissie-tools-test-"));
let db: typeof import("./db").db;
let tools: typeof import("./lissie-tools");
let service: typeof import("./todo-service");
let lissieRequestContext: typeof import("./lissie").lissieRequestContext;

const alice = "user-alice";
const bob = "user-bob";

beforeAll(async () => {
  // lib/db.ts reads DATABASE_URL on import, so point it at the temp file first.
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  ({ db } = await import("./db"));
  // Before Better Auth is imported: creating `auth` seeds the OAuth resource table.
  await migrate(db, { migrationsFolder: "db/migrations" });
  tools = await import("./lissie-tools");
  service = await import("./todo-service");
  ({ lissieRequestContext } = await import("./lissie"));
});

beforeEach(async () => {
  await db.delete(user);
  await db.insert(user).values([
    { id: alice, name: "Alice", email: "alice@example.com" },
    { id: bob, name: "Bob", email: "bob@example.com" },
  ]);
});

afterAll(() => {
  db?.$client.close();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

// The context a run for `userId` gets, exactly as createLissieHandler builds it.
function as(userId: string) {
  return { requestContext: lissieRequestContext(userId), observe: noopObserve };
}

describe("listTodos", () => {
  test("reads only the signed-in user's todos", async () => {
    await service.addTodo(alice, { title: "Feed the cat" });
    await service.addTodo(bob, { title: "Bob's secret plan" });

    const result = await tools.listTodos.execute?.(
      { status: "all" },
      as(alice),
    );

    expect(result).toEqual({
      todos: [expect.objectContaining({ title: "Feed the cat" })],
    });
  });

  test("filters by status and search", async () => {
    const milk = await service.addTodo(alice, { title: "Buy milk" });
    await service.addTodo(alice, { title: "Buy cat food" });
    await service.updateTodo(alice, milk.id, { done: true });

    const done = await tools.listTodos.execute?.({ status: "done" }, as(alice));
    const cat = await tools.listTodos.execute?.(
      { status: "all", search: "cat" },
      as(alice),
    );

    expect(done).toEqual({ todos: [expect.objectContaining({ id: milk.id })] });
    expect(cat).toEqual({
      todos: [expect.objectContaining({ title: "Buy cat food" })],
    });
  });
});

describe("addTodo", () => {
  test("adds to the signed-in user's list only", async () => {
    const result = await tools.addTodo.execute?.(
      { title: "  buy milk ", dueDate: "2026-10-09" },
      as(alice),
    );

    expect(result).toEqual({
      todo: expect.objectContaining({
        title: "buy milk",
        dueDate: "2026-10-09",
        done: false,
      }),
    });
    expect(await service.listTodos(alice)).toHaveLength(1);
    expect(await service.listTodos(bob)).toEqual([]);
  });

  test("a user id in the input is ignored: the owner comes from the request context", async () => {
    // A variable, because TypeScript rejects the extra key in a literal, just as the tool's schema drops it.
    const input = { title: "Sneaky", userId: bob };
    await tools.addTodo.execute?.(input, as(alice));

    expect(await service.listTodos(bob)).toEqual([]);
    expect(await service.listTodos(alice)).toEqual([
      expect.objectContaining({ title: "Sneaky" }),
    ]);
  });

  test("an invalid input adds nothing and tells the model why", async () => {
    const result = await tools.addTodo.execute?.({ title: "   " }, as(alice));

    expect(result).toMatchObject({ error: true });
    expect(await service.listTodos(alice)).toEqual([]);
  });
});

describe("setTodoDone", () => {
  test("marks the user's todo done and reopens it", async () => {
    const todo = await service.addTodo(alice, { title: "Feed the cat" });

    const done = await tools.setTodoDone.execute?.(
      { id: todo.id, done: true },
      as(alice),
    );
    expect(done).toEqual({
      todo: expect.objectContaining({ id: todo.id, done: true }),
    });

    const reopened = await tools.setTodoDone.execute?.(
      { id: todo.id, done: false },
      as(alice),
    );
    expect(reopened).toEqual({
      todo: expect.objectContaining({ done: false, completedAt: null }),
    });
  });

  test("another user's todo is not found and stays unchanged", async () => {
    const bobs = await service.addTodo(bob, { title: "Bob's todo" });

    const result = await tools.setTodoDone.execute?.(
      { id: bobs.id, done: true },
      as(alice),
    );

    expect(result).toEqual({
      error: { code: "todo-not-found", message: "Todo not found" },
    });
    expect(await service.getTodo(bob, bobs.id)).toMatchObject({ done: false });
  });

  test("an unknown id is the same not found", async () => {
    const result = await tools.setTodoDone.execute?.(
      { id: "00000000-0000-4000-8000-000000000000", done: true },
      as(alice),
    );

    expect(result).toEqual({
      error: { code: "todo-not-found", message: "Todo not found" },
    });
  });
});

describe("showProgress", () => {
  test("counts only the signed-in user's todos", async () => {
    const milk = await service.addTodo(alice, { title: "Buy milk" });
    await service.addTodo(alice, { title: "Feed the cat" });
    await service.addTodo(alice, { title: "Call the vet" });
    await service.updateTodo(alice, milk.id, { done: true });
    await service.addTodo(bob, { title: "Bob's todo" });

    const result = await tools.showProgress.execute?.({}, as(alice));

    // Alice's rows, counted here independently of the tool.
    const rows = await db.select().from(todos).where(eq(todos.userId, alice));
    const done = rows.filter((row) => row.done).length;
    expect(result).toEqual({
      total: rows.length,
      done,
      open: rows.length - done,
    });
    expect(result).toEqual({ total: 3, done: 1, open: 2 });
  });

  test("an empty list is zero of zero", async () => {
    expect(await tools.showProgress.execute?.({}, as(alice))).toEqual({
      total: 0,
      done: 0,
      open: 0,
    });
  });
});

describe("without a signed-in user", () => {
  test("every tool refuses to run", async () => {
    await service.addTodo(alice, { title: "Feed the cat" });
    const [todo] = await service.listTodos(alice);
    const nobody = {
      requestContext: new RequestContext(),
      observe: noopObserve,
    };

    await expect(
      tools.listTodos.execute?.({ status: "all" }, nobody),
    ).rejects.toThrow("signed-in user");
    await expect(
      tools.addTodo.execute?.({ title: "x" }, nobody),
    ).rejects.toThrow("signed-in user");
    await expect(
      tools.setTodoDone.execute?.({ id: todo.id, done: true }, nobody),
    ).rejects.toThrow("signed-in user");
    await expect(tools.showProgress.execute?.({}, nobody)).rejects.toThrow(
      "signed-in user",
    );
    expect(await service.listTodos(alice)).toHaveLength(1);
  });
});
