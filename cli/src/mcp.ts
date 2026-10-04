import { type CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { mcpToolConfig, todoToolsInstructions } from "@todo-cat/contract";
import packageJson from "../package.json" with { type: "json" };
import { commands } from "./commands";
import { toCliError } from "./errors";

// `todo-cat mcp --stdio`: every command in commands.ts as an MCP tool, served over stdin and stdout. Names, descriptions,
// annotations, and input schemas are the contract's todoTools, shared with the app's /api/mcp (lib/mcp-server.ts).
// A result is the command's --json output as text; a failure is a tool error carrying the CLI's error body.

const instructions = `The to-do list of the person who logged in with \`todo-cat login\` on this machine.
${todoToolsInstructions}
The code "unauthorized" means the person has to run \`todo-cat login\` in a terminal.`;

function text(value: unknown, isError = false): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError };
}

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "todo-cat", version: packageJson.version },
    { instructions },
  );
  for (const command of commands) {
    server.registerTool(command.name, mcpToolConfig(command), async (args) => {
      try {
        return text((await command.execute(args)).data);
      } catch (error) {
        const { code, message } = toCliError(error);
        return text({ error: { code, message } }, true);
      }
    });
  }
  return server;
}

// Serves until the client closes stdin. The session is read on every call, so the server starts without a login
// and picks up a later `todo-cat login` without a restart.
export function serveMcp(): void {
  // stdout is the protocol channel; send anything a dependency logs to stderr instead.
  console.log = console.info = console.debug = console.error;
  serveStdio(buildMcpServer, {
    onerror: (error) => console.error(`todo-cat mcp: ${error.message}`),
  });
}
