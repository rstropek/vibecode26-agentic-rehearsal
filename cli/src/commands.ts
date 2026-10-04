import {
  type TodoTool,
  type TodoToolName,
  todoFilterSchema,
  todoIdHelp,
  todoTools,
} from "@todo-cat/contract";
import { Option } from "commander";
import type { z } from "zod";
import {
  addTodo,
  deleteTodo,
  getTodo,
  listTodos,
  parseInput,
  type Session,
  updateTodo,
} from "./api";
import { currentUser } from "./auth";
import { loadToken, serverUrl } from "./config";
import { CliError } from "./errors";
import { todoDetails, todoLine, todoList, userText } from "./output";

// The commands that act on the signed-in user's list: one per tool in the contract's todoTools, which holds their
// names, descriptions, annotations, and input schemas. Each becomes both a CLI command (program.ts) and an MCP tool
// (mcp.ts); here they get how they run on the REST client and how the command line maps to their input.
// login, logout, and mcp manage the session and the server themselves, so they live in program.ts only.

// `text` for humans, `data` for --json and MCP.
export type Result = { text: string; data: unknown };

type Definition<Input extends z.ZodObject> = {
  // Runs with a session and checked input.
  run(session: Session, input: z.output<Input>): Promise<Result>;
  cli: {
    alias?: string;
    // Positional arguments as [name, description], e.g. ["<id>", "..."].
    arguments?: [string, string][];
    options?: Option[];
    examples: string[];
    // Turns the command line into the same arguments an MCP client sends; the input schema checks them.
    toInput(args: string[], options: Record<string, unknown>): unknown;
  };
};

export type TodoCommand = TodoTool & {
  cli: Definition<z.ZodObject>["cli"];
  // Checks the arguments with the tool's input schema, then runs with the stored session; fails with a CliError.
  execute(args: unknown): Promise<Result>;
};

function command<Input extends z.ZodObject>(
  tool: TodoTool<Input>,
  { run, cli }: Definition<Input>,
): TodoCommand {
  return {
    ...tool,
    cli,
    async execute(args) {
      const input = parseInput(tool.input, args);
      return run(await requireSession(), input);
    },
  };
}

export async function requireSession(): Promise<Session> {
  const server = serverUrl();
  const token = await loadToken(server);
  if (!token) {
    throw new CliError(
      "unauthorized",
      `Not logged in to ${server}; run \`todo-cat login\``,
    );
  }
  return { server, token };
}

// Every tool of the contract, so a tool added there fails to compile until it is a command here too.
const byName: Record<TodoToolName, TodoCommand> = {
  whoami: command(todoTools.whoami, {
    async run({ server, token }) {
      const user = await currentUser(server, token);
      if (!user) {
        throw new CliError(
          "unauthorized",
          `The session for ${server} is no longer valid; run \`todo-cat login\``,
        );
      }
      return {
        text: `Logged in to ${server} as ${userText(user)}.`,
        data: { server, user },
      };
    },
    cli: {
      examples: ["todo-cat whoami", "todo-cat whoami --json"],
      toInput: () => ({}),
    },
  }),

  list: command(todoTools.list, {
    async run(session, filter) {
      const todos = await listTodos(session, filter);
      return { text: todoList(todos), data: todos };
    },
    cli: {
      alias: "ls",
      options: [
        new Option("-s, --status <status>", "which todos to show")
          .choices(todoFilterSchema.shape.status.unwrap().options)
          .default("all"),
        new Option(
          "-q, --search <text>",
          "only titles containing this text (case-insensitive)",
        ),
      ],
      examples: [
        "todo-cat list",
        "todo-cat list --status open --search food",
        "todo-cat list --json",
      ],
      toInput: (_, { status, search }) => ({ status, search }),
    },
  }),

  show: command(todoTools.show, {
    async run(session, { id }) {
      const todo = await getTodo(session, id);
      return { text: todoDetails(todo), data: todo };
    },
    cli: {
      arguments: [["<id>", todoIdHelp]],
      examples: ["todo-cat show 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"],
      toInput: ([id]) => ({ id }),
    },
  }),

  add: command(todoTools.add, {
    async run(session, input) {
      const todo = await addTodo(session, input);
      return { text: `Added ${todoLine(todo)}`, data: todo };
    },
    cli: {
      arguments: [
        ["<title...>", "what needs doing; the words may be given unquoted"],
      ],
      options: [new Option("-d, --due <date>", "due date as yyyy-mm-dd")],
      examples: [
        "todo-cat add Buy cat food",
        'todo-cat add "Vet appointment" --due 2026-10-12',
        "todo-cat add Brush Lissie --json",
      ],
      toInput: (words, { due }) => ({ title: words.join(" "), dueDate: due }),
    },
  }),

  edit: command(todoTools.edit, {
    async run(session, { id, ...changes }) {
      const todo = await updateTodo(session, id, changes);
      return { text: `Updated ${todoLine(todo)}`, data: todo };
    },
    cli: {
      arguments: [["<id>", todoIdHelp]],
      options: [
        new Option("-t, --title <title>", "new title"),
        new Option("-d, --due <date>", "new due date as yyyy-mm-dd"),
        new Option("--no-due", "remove the due date"),
      ],
      examples: [
        'todo-cat edit 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed --title "Buy more cat food"',
        "todo-cat edit 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed --no-due",
      ],
      toInput: ([id], { title, due }) => {
        if (title === undefined && due === undefined) {
          throw new CliError(
            "usage",
            "Nothing to change; pass --title, --due, or --no-due",
          );
        }
        return { id, title, dueDate: due === false ? null : due };
      },
    },
  }),

  done: command(todoTools.done, {
    async run(session, { id }) {
      const todo = await updateTodo(session, id, { done: true });
      return { text: `Done ${todoLine(todo)}`, data: todo };
    },
    cli: {
      arguments: [["<id>", todoIdHelp]],
      examples: ["todo-cat done 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"],
      toInput: ([id]) => ({ id }),
    },
  }),

  reopen: command(todoTools.reopen, {
    async run(session, { id }) {
      const todo = await updateTodo(session, id, { done: false });
      return { text: `Reopened ${todoLine(todo)}`, data: todo };
    },
    cli: {
      arguments: [["<id>", todoIdHelp]],
      examples: ["todo-cat reopen 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"],
      toInput: ([id]) => ({ id }),
    },
  }),

  delete: command(todoTools.delete, {
    async run(session, { id }) {
      await deleteTodo(session, id);
      return { text: `Deleted ${id}.`, data: { id, deleted: true } };
    },
    cli: {
      alias: "rm",
      arguments: [["<id>", todoIdHelp]],
      examples: ["todo-cat delete 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed --yes"],
      toInput: ([id]) => ({ id }),
    },
  }),
};

export const commands: TodoCommand[] = Object.values(byName);
