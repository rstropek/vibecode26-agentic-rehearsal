import { z } from "zod";
import {
  createTodoInputSchema,
  todoFilterSchema,
  todoIdSchema,
  updateTodoInputSchema,
} from "./todos";

// The tools of both MCP servers, `todo-cat mcp --stdio` (cli/src/mcp.ts) and /api/mcp (lib/mcp-server.ts), and the
// CLI commands of the same names. Names, titles, descriptions, annotations, and input schemas live only here, so the
// servers cannot drift apart; each server adds only how a tool runs.

// MCP tool annotations: hints for the host, e.g. whether to ask the user before a call. The CLI asks for --yes
// before a destructive command instead.
export type TodoToolAnnotations =
  | { readOnlyHint: true }
  | { readOnlyHint: false; destructiveHint: boolean; idempotentHint: boolean };

export type TodoTool<Input extends z.ZodObject = z.ZodObject> = {
  name: string;
  // Display name of the MCP tool.
  title: string;
  // One line for the tool's description and `todo-cat --help`.
  description: string;
  input: Input;
  annotations: TodoToolAnnotations;
};

const readOnly = { readOnlyHint: true } as const;

function write(destructive: boolean, idempotent: boolean): TodoToolAnnotations {
  return {
    readOnlyHint: false,
    destructiveHint: destructive,
    idempotentHint: idempotent,
  };
}

export const todoIdHelp = "the todo's id, as printed by list";
const todoRefSchema = z.object({ id: todoIdSchema.describe(todoIdHelp) });

export const todoTools = {
  whoami: {
    name: "whoami",
    title: "Who am I",
    description: "show the signed-in user and the server",
    input: z.strictObject({}),
    annotations: readOnly,
  },
  list: {
    name: "list",
    title: "List todos",
    description:
      "list todos, open before done, then by due date; search matches part of a title, ignoring case",
    input: todoFilterSchema,
    annotations: readOnly,
  },
  show: {
    name: "show",
    title: "Show a todo",
    description: "show one todo",
    input: todoRefSchema,
    annotations: readOnly,
  },
  add: {
    name: "add",
    title: "Add a todo",
    description: "add a todo, optionally with a due date",
    input: createTodoInputSchema,
    annotations: write(false, false),
  },
  edit: {
    name: "edit",
    title: "Edit a todo",
    description: "change a todo's title or due date",
    input: todoRefSchema.extend({
      title: updateTodoInputSchema.shape.title,
      dueDate: updateTodoInputSchema.shape.dueDate.describe(
        "the new due date as yyyy-mm-dd, or null to remove it",
      ),
    }),
    annotations: write(false, true),
  },
  done: {
    name: "done",
    title: "Mark a todo as done",
    description: "mark a todo as done",
    input: todoRefSchema,
    annotations: write(false, true),
  },
  reopen: {
    name: "reopen",
    title: "Reopen a todo",
    description: "mark a done todo as open again",
    input: todoRefSchema,
    annotations: write(false, true),
  },
  delete: {
    name: "delete",
    title: "Delete a todo",
    description: "delete a todo for good",
    input: todoRefSchema,
    annotations: write(true, true),
  },
} satisfies Record<string, TodoTool>;

// A server implements every tool: it maps each name to its implementation with a Record<TodoToolName, ...>.
export type TodoToolName = keyof typeof todoTools;

// How to use the tools, for the instructions of both MCP servers; each puts whose list it is in front.
export const todoToolsInstructions = `Find a todo's id with list before you show, edit, done, reopen, or delete it; never guess an id.
delete is permanent, so use it only when the person asked to delete something.
A failed call returns {"error":{"code":"...","message":"..."}}.`;

// What `registerTool` of the MCP SDK takes besides the name and the callback.
export function mcpToolConfig<Input extends z.ZodObject>(
  tool: TodoTool<Input>,
) {
  return {
    title: tool.title,
    description: tool.description,
    inputSchema: tool.input,
    annotations: tool.annotations,
  };
}
