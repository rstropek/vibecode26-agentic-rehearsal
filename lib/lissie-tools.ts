import "server-only";
import {
  MASTRA_RESOURCE_ID_KEY,
  type RequestContext,
} from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import {
  addTodoInputSchema,
  addTodoOutputSchema,
  LISSIE_CATALOG_ID,
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

// The progress card, authored once as an A2UI v0.9 component tree: the basic catalog's Column and Text plus the
// ProgressBar from app/lissie-catalog.tsx. The tree holds no numbers; its components bind to /total, /done, and
// /open in the surface's data model, which showProgress fills from the todo service.
const PROGRESS_SURFACE_ID = "todo-progress";

// A data model value inside a formatString template, which A2UI writes as ${/path}.
function placeholder(path: string): string {
  return `\${${path}}`;
}

const progressCard = [
  {
    id: "root",
    component: "Column",
    children: ["progress-title", "progress-bar", "progress-open"],
  },
  {
    id: "progress-title",
    component: "Text",
    variant: "h4",
    text: "Progress, such as it is",
  },
  {
    id: "progress-bar",
    component: "ProgressBar",
    label: "Done",
    value: { path: "/done" },
    max: { path: "/total" },
  },
  {
    id: "progress-open",
    component: "Text",
    text: {
      call: "formatString",
      args: { value: `${placeholder("/open")} still open` },
    },
  },
];

export type TodoProgress = { total: number; done: number; open: number };

// The operations that paint the card for `progress`: create the surface, set the tree, then fill the data model.
export function progressCardOperations(progress: TodoProgress) {
  const surfaceId = PROGRESS_SURFACE_ID;
  return [
    {
      version: "v0.9",
      createSurface: { surfaceId, catalogId: LISSIE_CATALOG_ID },
    },
    {
      version: "v0.9",
      updateComponents: { surfaceId, components: progressCard },
    },
    {
      version: "v0.9",
      updateDataModel: { surfaceId, path: "/", value: progress },
    },
  ];
}

// The numbers come from the todo service, never from the model, and the card needs no second model call: the
// runtime's A2UI middleware finds the operations in the result and paints the surface (lib/copilot-runtime.ts).
export const showProgress = createTool({
  id: "showProgress",
  description:
    "Show the user a card in the chat with how many of their todos are done and how many are still open. The result holds the same numbers in the card's data model.",
  inputSchema: showProgressInputSchema,
  outputSchema: showProgressOutputSchema,
  execute: async (_input, { requestContext }) => {
    const todos = await listTodosForUser(userIdFrom(requestContext));
    const done = todos.filter((todo) => todo.done).length;
    return {
      a2ui_operations: progressCardOperations({
        total: todos.length,
        done,
        open: todos.length - done,
      }),
    };
  },
});

// The keys are the tool names the model calls and the chat renders by (LISSIE_TOOL_NAMES).
export const lissieTools = {
  listTodos,
  addTodo,
  setTodoDone,
  showProgress,
} satisfies Record<keyof typeof LISSIE_TOOL_NAMES, unknown>;
