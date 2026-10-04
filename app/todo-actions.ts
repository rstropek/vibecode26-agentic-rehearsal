"use server";

import {
  createTodoInputSchema,
  todoIdSchema,
  updateTodoInputSchema,
} from "@todo-cat/contract";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/session";
import {
  addTodo,
  deleteTodo,
  parseInput,
  TodoError,
  updateTodo,
} from "@/lib/todo-service";

// The page adapter's writes: the list on / calls these, they call the todo service for the session's user and
// refresh the page so the list re-renders. See tech-docs/architecture.md for the adapter rules.

// What the list shows after a failed write; the add form also gets back what was typed.
export type TodoActionState = {
  error?: string;
  title?: string;
  dueDate?: string;
};

// Runs `write` for the signed-in user, or sends a visitor without a session to sign in before reading any input.
// `invalid` is what the list shows for a `validation-failed`.
async function forUser(
  write: (userId: string) => Promise<unknown>,
  invalid = "The list couldn't make sense of that. Reload the page and try again.",
): Promise<TodoActionState> {
  const userId = await getUserId(await headers());
  if (!userId) redirect("/login");
  try {
    await write(userId);
  } catch (error) {
    if (!(error instanceof TodoError)) throw error;
    if (error.code === "validation-failed") return { error: invalid };
    // A todo that vanished means the list on screen is stale, so refresh it along with the message.
    refresh();
    return {
      error: "That todo is gone already. The list is up to date again.",
    };
  }
  refresh();
  return {};
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// The add form's action (useActionState): an empty due date field means no due date.
export async function addTodoAction(
  _previous: TodoActionState,
  formData: FormData,
): Promise<TodoActionState> {
  const title = text(formData, "title");
  const dueDate = text(formData, "dueDate");
  const state = await forUser(
    (userId) =>
      addTodo(
        userId,
        parseInput(createTodoInputSchema, { title, dueDate: dueDate || null }),
      ),
    "A todo needs a title of up to 200 characters and, if it has one, a real due date.",
  );
  return state.error ? { ...state, title, dueDate } : state;
}

export async function setTodoDoneAction(
  id: string,
  done: boolean,
): Promise<TodoActionState> {
  return forUser((userId) =>
    updateTodo(
      userId,
      parseInput(todoIdSchema, id),
      parseInput(updateTodoInputSchema, { done }),
    ),
  );
}

export async function deleteTodoAction(id: string): Promise<TodoActionState> {
  return forUser((userId) => deleteTodo(userId, parseInput(todoIdSchema, id)));
}
