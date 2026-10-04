import "server-only";
import { type CallToolResult, McpServer } from "@modelcontextprotocol/server";
import {
  type ErrorBody,
  mcpToolConfig,
  type TodoTool,
  type TodoToolName,
  todoTools,
  todoToolsInstructions,
} from "@todo-cat/contract";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { user } from "@/db/schema";
import { mcpResource } from "@/lib/auth-config";
import { db } from "@/lib/db";
import {
  addTodo,
  deleteTodo,
  getTodo,
  listTodos,
  parseInput,
  TodoError,
  updateTodo,
} from "@/lib/todo-service";
import packageJson from "@/package.json";

// The MCP server behind /api/mcp, one instance per request for the user of the verified access token.
// Its tools are the contract's todoTools, like those of `todo-cat mcp --stdio`, and call the todo service directly.
// A result is the same JSON as the CLI's --json output; a TodoError is a tool error with the contract's error body.

const instructions = `The to-do list of the person who authorized this connection.
${todoToolsInstructions}`;

function text(value: unknown, isError = false): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError };
}

type Register = (server: McpServer, userId: string) => void;

function tool<Input extends z.ZodObject>(
  definition: TodoTool<Input>,
  run: (userId: string, input: z.output<Input>) => Promise<unknown>,
): Register {
  return (server, userId) =>
    server.registerTool(
      definition.name,
      // Widened to any object schema: the SDK cannot infer a callback type from a generic schema; parseInput checks.
      mcpToolConfig<z.ZodObject>(definition),
      async (args) => {
        try {
          return text(await run(userId, parseInput(definition.input, args)));
        } catch (error) {
          if (!(error instanceof TodoError)) throw error;
          const body: ErrorBody = {
            error: { code: error.code, message: error.message },
          };
          return text(body, true);
        }
      },
    );
}

// Every tool of the contract, so a tool added there fails to compile until it is implemented here too.
const tools: Record<TodoToolName, Register> = {
  whoami: tool(todoTools.whoami, async (userId) => {
    const me = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .get();
    return { server: new URL(mcpResource).origin, user: me };
  }),
  list: tool(todoTools.list, (userId, filter) => listTodos(userId, filter)),
  show: tool(todoTools.show, (userId, { id }) => getTodo(userId, id)),
  add: tool(todoTools.add, (userId, input) => addTodo(userId, input)),
  edit: tool(todoTools.edit, (userId, { id, ...changes }) =>
    updateTodo(userId, id, changes),
  ),
  done: tool(todoTools.done, (userId, { id }) =>
    updateTodo(userId, id, { done: true }),
  ),
  reopen: tool(todoTools.reopen, (userId, { id }) =>
    updateTodo(userId, id, { done: false }),
  ),
  delete: tool(todoTools.delete, async (userId, { id }) => {
    await deleteTodo(userId, id);
    return { id, deleted: true };
  }),
};

export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer(
    { name: "todo-cat", version: packageJson.version },
    { instructions },
  );
  for (const register of Object.values(tools)) register(server, userId);
  return server;
}
