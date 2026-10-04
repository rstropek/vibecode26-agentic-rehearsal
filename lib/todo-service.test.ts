// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTodoInputSchema, type Todo } from "@todo-cat/contract";
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

type Service = typeof import("./todo-service");

const dir = mkdtempSync(join(tmpdir(), "todo-cat-todo-test-"));
let db: typeof import("./db").db;
let service: Service;

// Every use case runs with two users: Alice owns the todos, Bob tries to reach them.
const alice = "user-alice";
const bob = "user-bob";
const unknownId = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  // lib/db.ts reads DATABASE_URL on import, so point it at the temp file first.
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  ({ db } = await import("./db"));
  service = await import("./todo-service");
  await migrate(db, { migrationsFolder: "db/migrations" });
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

async function expectNotFound(attempt: Promise<unknown>) {
  await expect(attempt).rejects.toBeInstanceOf(service.TodoError);
  await expect(attempt).rejects.toMatchObject({
    code: "todo-not-found",
    message: "Todo not found",
  });
}

describe("addTodo", () => {
  test("creates an open todo owned by the user", async () => {
    const now = new Date("2026-10-04T08:00:00.000Z");
    const todo = await service.addTodo(
      alice,
      { title: "Buy cat food", dueDate: "2026-10-06" },
      now,
    );

    expect(todo).toEqual({
      id: expect.any(String),
      title: "Buy cat food",
      dueDate: "2026-10-06",
      done: false,
      createdAt: "2026-10-04T08:00:00.000Z",
      completedAt: null,
    });
    const row = await db
      .select()
      .from(todos)
      .where(eq(todos.id, todo.id))
      .get();
    expect(row?.userId).toBe(alice);
  });

  test("stores no due date when none is given", async () => {
    const todo = await service.addTodo(alice, { title: "Nap" });

    expect(todo.dueDate).toBeNull();
  });

  test("adds to the user's list only", async () => {
    const todo = await service.addTodo(alice, { title: "Alice's" });

    expect(await service.listTodos(alice)).toEqual([todo]);
    expect(await service.listTodos(bob)).toEqual([]);
  });
});

describe("getTodo", () => {
  test("returns the user's todo", async () => {
    const todo = await service.addTodo(alice, { title: "Vet appointment" });

    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });

  test("reports another user's todo as not found", async () => {
    const todo = await service.addTodo(alice, { title: "Secret" });

    await expectNotFound(service.getTodo(bob, todo.id));
  });

  test("reports an unknown id as not found", async () => {
    await expectNotFound(service.getTodo(alice, unknownId));
  });
});

describe("listTodos", () => {
  let open: Todo;
  let done: Todo;

  beforeEach(async () => {
    open = await service.addTodo(alice, { title: "Clean the litter box" });
    done = await service.addTodo(alice, { title: "Buy LITTER" });
    done = await service.updateTodo(alice, done.id, { done: true });
    await service.addTodo(bob, { title: "Bob's litter" });
  });

  test("lists all of the user's todos by default", async () => {
    expect(await service.listTodos(alice)).toEqual([open, done]);
    expect(await service.listTodos(alice, { status: "all" })).toEqual([
      open,
      done,
    ]);
  });

  test("filters by status", async () => {
    expect(await service.listTodos(alice, { status: "open" })).toEqual([open]);
    expect(await service.listTodos(alice, { status: "done" })).toEqual([done]);
  });

  test("filters by a case-insensitive part of the title", async () => {
    expect(await service.listTodos(alice, { search: "litter" })).toEqual([
      open,
      done,
    ]);
    expect(await service.listTodos(alice, { search: "BOX" })).toEqual([open]);
    expect(await service.listTodos(alice, { search: "dog" })).toEqual([]);
  });

  test("treats LIKE wildcards in the search as plain text", async () => {
    const percent = await service.addTodo(alice, {
      title: "Save 100% of naps",
    });

    expect(await service.listTodos(alice, { search: "%" })).toEqual([percent]);
    expect(await service.listTodos(alice, { search: "_" })).toEqual([]);
  });

  test("combines status and search", async () => {
    expect(
      await service.listTodos(alice, { status: "done", search: "litter" }),
    ).toEqual([done]);
  });

  test("never lists another user's todos", async () => {
    const bobs = await service.listTodos(bob, { search: "litter" });

    expect(bobs.map((todo) => todo.title)).toEqual(["Bob's litter"]);
    expect(await service.listTodos(bob, { status: "done" })).toEqual([]);
  });

  test("orders open before done, then by due date with undated last, then oldest first", async () => {
    await db.delete(todos);
    const at = (day: number) => new Date(`2026-10-0${day}T00:00:00.000Z`);
    const undatedOld = await service.addTodo(alice, { title: "a" }, at(1));
    const undatedNew = await service.addTodo(alice, { title: "b" }, at(2));
    const late = await service.addTodo(
      alice,
      { title: "c", dueDate: "2026-12-01" },
      at(3),
    );
    const soon = await service.addTodo(
      alice,
      { title: "d", dueDate: "2026-10-10" },
      at(4),
    );
    const finished = await service.updateTodo(
      alice,
      (
        await service.addTodo(
          alice,
          { title: "e", dueDate: "2026-01-01" },
          at(5),
        )
      ).id,
      { done: true },
    );

    expect((await service.listTodos(alice)).map((todo) => todo.id)).toEqual([
      soon.id,
      late.id,
      undatedOld.id,
      undatedNew.id,
      finished.id,
    ]);
  });
});

describe("updateTodo", () => {
  const created = new Date("2026-10-01T09:00:00.000Z");
  const finishedAt = new Date("2026-10-03T17:30:00.000Z");
  let todo: Todo;

  beforeEach(async () => {
    todo = await service.addTodo(
      alice,
      { title: "Brush Lissie", dueDate: "2026-10-05" },
      created,
    );
  });

  test("changes the title and keeps the other fields", async () => {
    const updated = await service.updateTodo(alice, todo.id, {
      title: "Brush Lissie gently",
    });

    expect(updated).toEqual({ ...todo, title: "Brush Lissie gently" });
  });

  test("changes and clears the due date", async () => {
    expect(
      await service.updateTodo(alice, todo.id, { dueDate: "2026-10-31" }),
    ).toMatchObject({ dueDate: "2026-10-31" });
    expect(
      await service.updateTodo(alice, todo.id, { dueDate: null }),
    ).toMatchObject({ dueDate: null, title: "Brush Lissie" });
  });

  test("sets completedAt when marked done and keeps it when marked done again", async () => {
    const done = await service.updateTodo(
      alice,
      todo.id,
      { done: true },
      finishedAt,
    );
    const again = await service.updateTodo(
      alice,
      todo.id,
      { done: true },
      new Date("2026-10-04T00:00:00.000Z"),
    );

    expect(done).toMatchObject({
      done: true,
      completedAt: finishedAt.toISOString(),
    });
    expect(again.completedAt).toBe(finishedAt.toISOString());
  });

  test("clears completedAt when reopened", async () => {
    await service.updateTodo(alice, todo.id, { done: true }, finishedAt);
    const reopened = await service.updateTodo(alice, todo.id, { done: false });

    expect(reopened).toMatchObject({ done: false, completedAt: null });
  });

  test("leaves completedAt alone when only the title changes", async () => {
    await service.updateTodo(alice, todo.id, { done: true }, finishedAt);
    const renamed = await service.updateTodo(alice, todo.id, { title: "x" });

    expect(renamed.completedAt).toBe(finishedAt.toISOString());
  });

  test("returns the todo unchanged for an empty update", async () => {
    expect(await service.updateTodo(alice, todo.id, {})).toEqual(todo);
  });

  test("reports another user's todo as not found and leaves it unchanged", async () => {
    await expectNotFound(
      service.updateTodo(bob, todo.id, { title: "Hijacked", done: true }),
    );
    await expectNotFound(service.updateTodo(bob, todo.id, {}));

    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });

  test("reports an unknown id as not found", async () => {
    await expectNotFound(service.updateTodo(alice, unknownId, { done: true }));
  });
});

describe("deleteTodo", () => {
  test("deletes the user's todo", async () => {
    const todo = await service.addTodo(alice, { title: "Gone soon" });

    await service.deleteTodo(alice, todo.id);

    await expectNotFound(service.getTodo(alice, todo.id));
    await expectNotFound(service.deleteTodo(alice, todo.id));
  });

  test("reports another user's todo as not found and keeps it", async () => {
    const todo = await service.addTodo(alice, { title: "Mine" });

    await expectNotFound(service.deleteTodo(bob, todo.id));

    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });
});

describe("owner", () => {
  test("deleting a user deletes their todos and nobody else's", async () => {
    await service.addTodo(alice, { title: "Alice's" });
    const bobs = await service.addTodo(bob, { title: "Bob's" });

    await db.delete(user).where(eq(user.id, alice));

    expect(await db.select().from(todos)).toEqual([
      expect.objectContaining({ id: bobs.id, userId: bob }),
    ]);
  });
});

describe("parseInput", () => {
  test("returns the parsed input", () => {
    expect(
      service.parseInput(createTodoInputSchema, { title: "  Feed Lissie  " }),
    ).toEqual({ title: "Feed Lissie" });
  });

  test("throws validation-failed for invalid input", () => {
    expect(() =>
      service.parseInput(createTodoInputSchema, {
        title: "",
        dueDate: "tomorrow",
      }),
    ).toThrow(
      expect.objectContaining({
        name: "TodoError",
        code: "validation-failed",
        message: expect.stringContaining("dueDate"),
      }),
    );
  });
});
