import {
  createTodoInputSchema,
  errorBodySchema,
  todoFilterSchema,
  todoIdSchema,
  todoListSchema,
  todoSchema,
} from "@todo-cat/contract";
import { z } from "zod";

// The shapes of Lissie's tools, shared by the tools on the server (lib/lissie-tools.ts) and the chat that renders
// their calls in the browser (app/lissie-tool-calls.tsx), so this module must stay free of server imports.
// The key of each tool in the agent's `tools` map is the name the model and the chat see.

export const LISSIE_TOOL_NAMES = {
  listTodos: "listTodos",
  addTodo: "addTodo",
  setTodoDone: "setTodoDone",
} as const;

export const listTodosInputSchema = todoFilterSchema;
export const listTodosOutputSchema = z.object({ todos: todoListSchema });

export const addTodoInputSchema = createTodoInputSchema;
export const addTodoOutputSchema = z.object({ todo: todoSchema });

export const setTodoDoneInputSchema = z.object({
  id: todoIdSchema,
  done: z.boolean(),
});
// An unknown id, or another user's, is the contract's error body, which the model reads and answers in character.
export const setTodoDoneOutputSchema = z.union([
  z.object({ todo: todoSchema }),
  errorBodySchema,
]);
