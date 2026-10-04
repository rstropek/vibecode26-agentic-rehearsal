import "server-only";
import {
  MASTRA_RESOURCE_ID_KEY,
  type RequestContext,
} from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import {
  addTodoInputSchema,
  addTodoOutputSchema,
  type LISSIE_TOOL_NAMES,
  listTodosInputSchema,
  listTodosOutputSchema,
  setTodoDoneInputSchema,
  setTodoDoneOutputSchema,
  showProgressInputSchema,
  showProgressOutputSchema,
} from "@/lib/lissie-tool-schemas";
import {
  addTodo as addTodoForUser,
  countTodos,
  listTodos as listTodosForUser,
  TodoError,
  updateTodo,
} from "@/lib/todo-service";

// Lissie's tools: the agent adapter on the todo service; see tech-docs/agent.md.
// No tool takes a user id as input. The owner is the signed-in user, which createLissieHandler puts on the request
// context under Mastra's resource id key from the server session, so the model can only reach that user's list.

// The signed-in user of this run. Without one there is nobody to act for, so the tool fails instead of guessing.
export function userIdFrom(requestContext: RequestContext | undefined): string {
  const userId = requestContext?.get(MASTRA_RESOURCE_ID_KEY);
  if (typeof userId !== "string" || userId === "") {
    throw new Error("Lissie's tools need a signed-in user");
  }
  return userId;
}

// Mastra validates the input against the contract schema before execute runs and hands a bad input back to the
// model as a validation error, so the executors receive parsed input, like after parseInput in the other adapters.

export const listTodos = createTool({
  id: "listTodos",
  description:
    "Read the user's to-do list: open todos first, then done ones. Filter by status, or search titles for a phrase. Use it to find a todo's id before marking it done.",
  inputSchema: listTodosInputSchema,
  outputSchema: listTodosOutputSchema,
  execute: async (filter, { requestContext }) => ({
    todos: await listTodosForUser(userIdFrom(requestContext), filter),
  }),
});

export const addTodo = createTool({
  id: "addTodo",
  description:
    "Add a todo to the user's list. dueDate is an optional calendar day as yyyy-mm-dd.",
  inputSchema: addTodoInputSchema,
  outputSchema: addTodoOutputSchema,
  execute: async (input, { requestContext }) => ({
    todo: await addTodoForUser(userIdFrom(requestContext), input),
  }),
});

export const setTodoDone = createTool({
  id: "setTodoDone",
  description:
    "Mark one of the user's todos as done (done: true) or reopen it (done: false). Takes the todo's id from listTodos or addTodo.",
  inputSchema: setTodoDoneInputSchema,
  outputSchema: setTodoDoneOutputSchema,
  execute: async ({ id, done }, { requestContext }) => {
    const userId = userIdFrom(requestContext);
    try {
      return { todo: await updateTodo(userId, id, { done }) };
    } catch (error) {
      if (error instanceof TodoError) {
        return { error: { code: error.code, message: error.message } };
      }
      throw error;
    }
  },
});

// The numbers come from the todo service, never from the model. The result is only those numbers; the chat shows
// them as a card that lib/lissie-cards.ts builds from the result, so no second model call builds the UI.
export const showProgress = createTool({
  id: "showProgress",
  description:
    "Show the user a card in the chat with how many of their todos are done and how many are still open. The result holds the numbers the card shows.",
  inputSchema: showProgressInputSchema,
  outputSchema: showProgressOutputSchema,
  execute: async (_input, { requestContext }) =>
    countTodos(userIdFrom(requestContext)),
});

// The keys are the tool names the model calls and the chat renders by (LISSIE_TOOL_NAMES).
export const lissieTools = {
  listTodos,
  addTodo,
  setTodoDone,
  showProgress,
} satisfies Record<keyof typeof LISSIE_TOOL_NAMES, unknown>;
