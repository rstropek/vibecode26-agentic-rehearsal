import {
  createTodoInputSchema,
  todoFilterSchema,
  todoIdSchema,
  updateTodoInputSchema,
} from "@todo-cat/contract";
import { Option } from "commander";
import { z } from "zod";
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

// The commands that act on the signed-in user's list. Each one is defined once, here, and becomes both a CLI
// command (program.ts) and an MCP tool (mcp.ts), so a command added to this list is a tool too.
// login, logout, and mcp manage the session and the server themselves, so they live in program.ts only.

// Behavior hints: the CLI asks for --yes before a destructive command, and MCP sends them as tool annotations.
export type Annotations =
  | { readOnly: true }
  | { readOnly: false; destructive: boolean; idempotent: boolean };

// `text` for humans, `data` for --json and MCP.
export type Result = { text: string; data: unknown };

type Definition<Input extends z.ZodObject> = {
  name: string;
  // Display name of the MCP tool.
  title: string;
  // One line for `todo-cat --help` and the tool's description.
  description: string;
  // The tool's input schema, from the contract; the CLI checks its arguments with it too.
  input: Input;
  annotations: Annotations;
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

export type TodoCommand = Omit<Definition<z.ZodObject>, "run"> & {
  // Checks the arguments, then runs with the stored session; fails with a CliError.
  execute(args: unknown): Promise<Result>;
};

function command<Input extends z.ZodObject>(
  definition: Definition<Input>,
): TodoCommand {
  return {
    ...definition,
    async execute(args) {
      const input = parseInput(definition.input, args);
      return definition.run(await requireSession(), input);
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

const idHelp = "the todo's id, as printed by list";
const todoRefSchema = z.object({ id: todoIdSchema.describe(idHelp) });

export const commands: TodoCommand[] = [
  command({
    name: "whoami",
    title: "Who am I",
    description: "show the signed-in user and the server",
    input: z.strictObject({}),
    annotations: { readOnly: true },
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

  command({
    name: "list",
    title: "List todos",
    description:
      "list todos, open before done, then by due date; search matches part of a title, ignoring case",
    input: todoFilterSchema,
    annotations: { readOnly: true },
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

  command({
    name: "show",
    title: "Show a todo",
    description: "show one todo",
    input: todoRefSchema,
    annotations: { readOnly: true },
    async run(session, { id }) {
      const todo = await getTodo(session, id);
      return { text: todoDetails(todo), data: todo };
    },
    cli: {
      arguments: [["<id>", idHelp]],
      examples: ["todo-cat show 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"],
      toInput: ([id]) => ({ id }),
    },
  }),

  command({
    name: "add",
    title: "Add a todo",
    description: "add a todo, optionally with a due date",
    input: createTodoInputSchema,
    annotations: { readOnly: false, destructive: false, idempotent: false },
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

  command({
    name: "edit",
    title: "Edit a todo",
    description: "change a todo's title or due date",
    input: todoRefSchema.extend({
      title: updateTodoInputSchema.shape.title,
      dueDate: updateTodoInputSchema.shape.dueDate.describe(
        "the new due date as yyyy-mm-dd, or null to remove it",
      ),
    }),
    annotations: { readOnly: false, destructive: false, idempotent: true },
    async run(session, { id, ...changes }) {
      const todo = await updateTodo(session, id, changes);
      return { text: `Updated ${todoLine(todo)}`, data: todo };
    },
    cli: {
      arguments: [["<id>", idHelp]],
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

  command({
    name: "done",
    title: "Mark a todo as done",
    description: "mark a todo as done",
    input: todoRefSchema,
    annotations: { readOnly: false, destructive: false, idempotent: true },
    async run(session, { id }) {
      const todo = await updateTodo(session, id, { done: true });
      return { text: `Done ${todoLine(todo)}`, data: todo };
    },
    cli: {
      arguments: [["<id>", idHelp]],
      examples: ["todo-cat done 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"],
      toInput: ([id]) => ({ id }),
    },
  }),

  command({
    name: "reopen",
    title: "Reopen a todo",
    description: "mark a done todo as open again",
    input: todoRefSchema,
    annotations: { readOnly: false, destructive: false, idempotent: true },
    async run(session, { id }) {
      const todo = await updateTodo(session, id, { done: false });
      return { text: `Reopened ${todoLine(todo)}`, data: todo };
    },
    cli: {
      arguments: [["<id>", idHelp]],
      examples: ["todo-cat reopen 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"],
      toInput: ([id]) => ({ id }),
    },
  }),

  command({
    name: "delete",
    title: "Delete a todo",
    description: "delete a todo for good",
    input: todoRefSchema,
    annotations: { readOnly: false, destructive: true, idempotent: true },
    async run(session, { id }) {
      await deleteTodo(session, id);
      return { text: `Deleted ${id}.`, data: { id, deleted: true } };
    },
    cli: {
      alias: "rm",
      arguments: [["<id>", idHelp]],
      examples: ["todo-cat delete 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed --yes"],
      toInput: ([id]) => ({ id }),
    },
  }),
];
