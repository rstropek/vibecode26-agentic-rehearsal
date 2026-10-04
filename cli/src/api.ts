import {
  type CreateTodoInput,
  createTodoInputSchema,
  errorBodySchema,
  type Todo,
  type TodoFilter,
  todoFilterSchema,
  todoListSchema,
  todoSchema,
  type UpdateTodoInput,
  updateTodoInputSchema,
} from "@todo-cat/contract";
import type { z } from "zod";
import { CliError } from "./errors";

// The REST client for /api/todos: inputs are checked and responses parsed with the contract schemas,
// so a bad argument fails before the request and a server that changed its shape fails loudly.

export type Session = { server: string; token: string };

// fetch that turns a connection failure into `server-unreachable`.
export async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const reason =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : String(error);
    throw new CliError(
      "server-unreachable",
      `Cannot reach ${new URL(url).origin} (${reason}); is the server running? Set TODO_CAT_URL to use another one.`,
    );
  }
}

// A client-side schema failure is a `validation-failed`, exactly like the server's.
function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) =>
        issue.path.length > 0
          ? `${issue.path.join(".")}: ${issue.message}`
          : issue.message,
      )
      .join("; ");
    throw new CliError("validation-failed", message);
  }
  return result.data;
}

// Sends one authenticated request and returns its parsed JSON body (undefined for 204); an error body becomes a CliError.
async function request(
  session: Session,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const headers = new Headers({ authorization: `Bearer ${session.token}` });
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await send(`${session.server}/api/todos${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (response.ok) return body;
  const error = errorBodySchema.safeParse(body);
  if (error.success) {
    throw new CliError(error.data.error.code, error.data.error.message);
  }
  throw new CliError(
    "unexpected-response",
    `${response.status} ${response.statusText} from /api/todos${path}`,
  );
}

function parseResponse<S extends z.ZodType>(
  schema: S,
  body: unknown,
): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new CliError(
      "unexpected-response",
      `The server's response does not match the contract: ${result.error.message}`,
    );
  }
  return result.data;
}

// Ids go into the path, so encode them; any id the server does not know is a `todo-not-found`.
function itemPath(id: string): string {
  return `/${encodeURIComponent(id)}`;
}

export async function listTodos(
  session: Session,
  filter: TodoFilter,
): Promise<Todo[]> {
  const { status, search } = parseInput(todoFilterSchema, filter);
  const query = new URLSearchParams({ status });
  if (search) query.set("search", search);
  return parseResponse(todoListSchema, await request(session, `?${query}`));
}

export async function getTodo(session: Session, id: string): Promise<Todo> {
  return parseResponse(todoSchema, await request(session, itemPath(id)));
}

export async function addTodo(
  session: Session,
  input: CreateTodoInput,
): Promise<Todo> {
  const body = parseInput(createTodoInputSchema, input);
  return parseResponse(
    todoSchema,
    await request(session, "", { method: "POST", body }),
  );
}

export async function updateTodo(
  session: Session,
  id: string,
  input: UpdateTodoInput,
): Promise<Todo> {
  const body = parseInput(updateTodoInputSchema, input);
  return parseResponse(
    todoSchema,
    await request(session, itemPath(id), { method: "PATCH", body }),
  );
}

export async function deleteTodo(session: Session, id: string): Promise<void> {
  await request(session, itemPath(id), { method: "DELETE" });
}
