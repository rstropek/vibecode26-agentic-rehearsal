import "server-only";
import type {
  CreateTodoInput,
  Todo,
  TodoFilter,
  UpdateTodoInput,
} from "@todo-cat/contract";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { todos } from "@/db/schema";
import { db } from "@/lib/db";

// The todo core: every todo query and rule lives here, and nothing else touches the todos table.
// Every function takes the owner's user id first and filters by it; see tech-docs/architecture.md.

export type TodoErrorCode = "todo-not-found" | "validation-failed";

export class TodoError extends Error {
  constructor(
    readonly code: TodoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TodoError";
  }
}

// Adapters parse their input with a contract schema through this, so a bad input is always `validation-failed`.
export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new TodoError("validation-failed", z.prettifyError(result.error));
  }
  return result.data;
}

// The same error for a missing id and another user's id, so the API never reveals that an id exists.
function notFound(): TodoError {
  return new TodoError("todo-not-found", "Todo not found");
}

type TodoRow = typeof todos.$inferSelect;

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.dueDate,
    done: row.done,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function ownedBy(userId: string, id: string): SQL | undefined {
  return and(eq(todos.userId, userId), eq(todos.id, id));
}

// Open todos first, then by due date (todos without one last), then oldest first.
export async function listTodos(
  userId: string,
  filter: TodoFilter = {},
): Promise<Todo[]> {
  const { status = "all", search } = filter;
  const rows = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        status === "all" ? undefined : eq(todos.done, status === "done"),
        // SQLite's lower() only folds ASCII, so "Ä" does not match "ä".
        search
          ? sql`instr(lower(${todos.title}), lower(${search})) > 0`
          : undefined,
      ),
    )
    .orderBy(
      asc(todos.done),
      sql`${todos.dueDate} is null`,
      asc(todos.dueDate),
      asc(todos.createdAt),
      asc(todos.id),
    );
  return rows.map(toTodo);
}

export async function getTodo(userId: string, id: string): Promise<Todo> {
  const row = await db.select().from(todos).where(ownedBy(userId, id)).get();
  if (!row) throw notFound();
  return toTodo(row);
}

// `now` is the creation time; only tests and the dev seed pass it.
export async function addTodo(
  userId: string,
  input: CreateTodoInput,
  now = new Date(),
): Promise<Todo> {
  const [row] = await db
    .insert(todos)
    .values({
      userId,
      title: input.title,
      dueDate: input.dueDate ?? null,
      createdAt: now,
    })
    .returning();
  return toTodo(row);
}

// Marking a todo done sets `completedAt` to `now` unless it was already done; reopening clears it.
export async function updateTodo(
  userId: string,
  id: string,
  input: UpdateTodoInput,
  now = new Date(),
): Promise<Todo> {
  const { title, dueDate, done } = input;
  if (title === undefined && dueDate === undefined && done === undefined) {
    return getTodo(userId, id);
  }

  const [row] = await db
    .update(todos)
    .set({
      title,
      dueDate,
      done,
      completedAt:
        done === undefined
          ? undefined
          : done
            ? sql`coalesce(${todos.completedAt}, ${now.getTime()})`
            : null,
    })
    .where(ownedBy(userId, id))
    .returning();
  if (!row) throw notFound();
  return toTodo(row);
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(todos)
    .where(ownedBy(userId, id))
    .returning({ id: todos.id });
  if (deleted.length === 0) throw notFound();
}
