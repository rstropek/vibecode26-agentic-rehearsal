import type { Todo } from "@todo-cat/contract";
import type { User } from "./auth";
import type { CliError } from "./errors";

// Everything the CLI prints goes through here: results on stdout, errors on stderr, as text or as JSON.

export type Output = {
  json: boolean;
  // A result: `text` for humans, `data` for --json.
  result(text: string, data: unknown): void;
};

export function createOutput(json: boolean): Output {
  return {
    json,
    result(text, data) {
      process.stdout.write(`${json ? JSON.stringify(data) : text}\n`);
    },
  };
}

// The same shape as the API's error body, so agents parse one format for both.
export function printError(error: CliError, json: boolean): void {
  process.stderr.write(
    json
      ? `${JSON.stringify({ error: { code: error.code, message: error.message } })}\n`
      : `todo-cat: ${error.message} [${error.code}]\n`,
  );
}

const noDue = " ".repeat(10);

// One line per todo with fixed-width columns: id, done box, due date, title.
export function todoLine(todo: Todo): string {
  return `${todo.id}  ${todo.done ? "[x]" : "[ ]"}  ${todo.dueDate ?? noDue}  ${todo.title}`;
}

export function todoList(todos: Todo[]): string {
  return todos.length === 0 ? "No todos." : todos.map(todoLine).join("\n");
}

export function todoDetails(todo: Todo): string {
  return [
    todo.title,
    `  id         ${todo.id}`,
    `  status     ${todo.done ? `done (${todo.completedAt})` : "open"}`,
    `  due        ${todo.dueDate ?? "none"}`,
    `  created    ${todo.createdAt}`,
  ].join("\n");
}

export function userText(user: User): string {
  return `${user.name} <${user.email}>`;
}
