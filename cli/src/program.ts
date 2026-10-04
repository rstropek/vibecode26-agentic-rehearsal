import type { TodoStatus } from "@todo-cat/contract";
import { Command, CommanderError, Option } from "commander";
import packageJson from "../package.json" with { type: "json" };
import {
  addTodo,
  deleteTodo,
  getTodo,
  listTodos,
  type Session,
  updateTodo,
} from "./api";
import { currentUser, deviceLogin, revokeSession, type User } from "./auth";
import { loadToken, removeToken, saveToken, serverUrl } from "./config";
import { CliError, exitCodeHelp } from "./errors";
import {
  createOutput,
  type Output,
  printError,
  todoDetails,
  todoLine,
  todoList,
} from "./output";

// The commands. Each one parses its arguments, calls api.ts or auth.ts, and prints through output.ts.

const environmentHelp = `Environment:
  TODO_CAT_URL     server to talk to (default: http://localhost:3000)
  XDG_CONFIG_HOME  config directory; the session token is stored owner-only in
                   $XDG_CONFIG_HOME/todo-cat/credentials.json (default ~/.config)`;

const examples = (lines: string[]) =>
  `\nExamples:\n${lines.map((line) => `  $ ${line}`).join("\n")}`;

async function requireSession(): Promise<Session> {
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

function userText(user: User): string {
  return `${user.name} <${user.email}>`;
}

export function buildProgram(): Command {
  const program = new Command("todo-cat")
    .description(
      "Manage your todo-cat lists from the terminal. Lissie keeps them; you do them.",
    )
    .version(packageJson.version)
    .option(
      "--json",
      "print results as JSON on stdout and errors as JSON on stderr",
    )
    .configureHelp({ showGlobalOptions: true })
    .exitOverride()
    .configureOutput({ outputError: () => {} })
    .addHelpText(
      "after",
      `${examples([
        "todo-cat login",
        "todo-cat add Buy cat food --due 2026-10-06",
        "todo-cat list --status open",
        "todo-cat done 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
        "todo-cat list --json",
      ])}

Output: text for humans by default; with --json, one JSON value on stdout (login
prints one JSON object per line) and errors on stderr as
{"error":{"code":"...","message":"..."}}. Commands never prompt.

${exitCodeHelp}

${environmentHelp}`,
    );

  // --json is a program option, recognized before or after the command name.
  const output = (): Output =>
    createOutput(program.opts<{ json?: boolean }>().json === true);

  program
    .command("login")
    .description(
      "log in through the browser with a one-time code (device authorization)",
    )
    .addHelpText(
      "after",
      `
Prints a one-time code and a URL, then waits until a signed-in user approves the
code on that page (up to the code's lifetime). It never opens a browser: agents,
show the code and URL to your human and keep the command running.
${examples(["todo-cat login", "TODO_CAT_URL=https://todo.example.com todo-cat login --json"])}`,
    )
    .action(async () => {
      const out = output();
      const server = serverUrl();
      const previous = await loadToken(server);
      const token = await deviceLogin(server, (code) => {
        const display = code.userCode.replace(/^(.{4})(.+)$/, "$1-$2");
        out.result(
          [
            `First copy your one-time code: ${display}`,
            `Then open ${code.verificationUri} in a browser, sign in, and enter the code,`,
            `or open ${code.verificationUriComplete}`,
            `Waiting for approval (the code expires in ${Math.round(code.expiresIn / 60)} minutes)...`,
          ].join("\n"),
          { ...code, userCode: display },
        );
      });
      await saveToken(server, token);
      // The old session is replaced; end it so it does not linger. Failing here does not fail the login.
      if (previous && previous !== token) {
        await revokeSession(server, previous).catch(() => {});
      }
      const user = await currentUser(server, token);
      if (!user) {
        throw new CliError(
          "unexpected-response",
          "The new session was rejected",
        );
      }
      out.result(`Logged in to ${server} as ${userText(user)}.`, {
        server,
        user,
      });
    });

  program
    .command("logout")
    .description("end the session on the server and forget the local token")
    .addHelpText("after", examples(["todo-cat logout"]))
    .action(async () => {
      const out = output();
      const server = serverUrl();
      const token = await loadToken(server);
      if (!token) {
        out.result(`Not logged in to ${server}.`, {
          server,
          loggedOut: true,
        });
        return;
      }
      try {
        await revokeSession(server, token);
      } catch (error) {
        await removeToken(server);
        if (!(error instanceof CliError)) throw error;
        throw new CliError(
          error.code,
          `Removed the local token, but could not end the session on the server: ${error.message}`,
        );
      }
      await removeToken(server);
      out.result(`Logged out of ${server}.`, { server, loggedOut: true });
    });

  program
    .command("whoami")
    .description("show the signed-in user and the server")
    .addHelpText(
      "after",
      examples(["todo-cat whoami", "todo-cat whoami --json"]),
    )
    .action(async () => {
      const out = output();
      const { server, token } = await requireSession();
      const user = await currentUser(server, token);
      if (!user) {
        throw new CliError(
          "unauthorized",
          `The session for ${server} is no longer valid; run \`todo-cat login\``,
        );
      }
      out.result(`Logged in to ${server} as ${userText(user)}.`, {
        server,
        user,
      });
    });

  program
    .command("list")
    .alias("ls")
    .description(
      "list todos, open before done, then by due date (columns: id, done, due, title)",
    )
    .addOption(
      new Option("-s, --status <status>", "which todos to show")
        .choices(["open", "done", "all"])
        .default("all"),
    )
    .option(
      "-q, --search <text>",
      "only titles containing this text (case-insensitive)",
    )
    .addHelpText(
      "after",
      examples([
        "todo-cat list",
        "todo-cat list --status open --search food",
        "todo-cat list --json",
      ]),
    )
    .action(async (options: { status: TodoStatus; search?: string }) => {
      const out = output();
      const todos = await listTodos(await requireSession(), options);
      out.result(todoList(todos), todos);
    });

  program
    .command("show")
    .description("show one todo")
    .argument("<id>", "the todo's id, as printed by list")
    .addHelpText(
      "after",
      examples(["todo-cat show 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"]),
    )
    .action(async (id: string) => {
      const out = output();
      const todo = await getTodo(await requireSession(), id);
      out.result(todoDetails(todo), todo);
    });

  program
    .command("add")
    .description("add a todo; the words of the title may be given unquoted")
    .argument("<title...>", "what needs doing")
    .option("-d, --due <date>", "due date as yyyy-mm-dd")
    .addHelpText(
      "after",
      examples([
        "todo-cat add Buy cat food",
        'todo-cat add "Vet appointment" --due 2026-10-12',
        "todo-cat add Brush Lissie --json",
      ]),
    )
    .action(async (words: string[], options: { due?: string }) => {
      const out = output();
      const todo = await addTodo(await requireSession(), {
        title: words.join(" "),
        dueDate: options.due,
      });
      out.result(`Added ${todoLine(todo)}`, todo);
    });

  program
    .command("edit")
    .description("change a todo's title or due date")
    .argument("<id>", "the todo's id, as printed by list")
    .option("-t, --title <title>", "new title")
    .option("-d, --due <date>", "new due date as yyyy-mm-dd")
    .option("--no-due", "remove the due date")
    .addHelpText(
      "after",
      examples([
        'todo-cat edit 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed --title "Buy more cat food"',
        "todo-cat edit 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed --no-due",
      ]),
    )
    .action(
      async (id: string, options: { title?: string; due?: string | false }) => {
        const out = output();
        if (options.title === undefined && options.due === undefined) {
          throw new CliError(
            "usage",
            "Nothing to change; pass --title, --due, or --no-due",
          );
        }
        const todo = await updateTodo(await requireSession(), id, {
          title: options.title,
          dueDate: options.due === false ? null : options.due,
        });
        out.result(`Updated ${todoLine(todo)}`, todo);
      },
    );

  program
    .command("done")
    .description("mark a todo as done")
    .argument("<id>", "the todo's id, as printed by list")
    .addHelpText(
      "after",
      examples(["todo-cat done 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"]),
    )
    .action(async (id: string) => {
      const out = output();
      const todo = await updateTodo(await requireSession(), id, {
        done: true,
      });
      out.result(`Done ${todoLine(todo)}`, todo);
    });

  program
    .command("reopen")
    .description("mark a done todo as open again")
    .argument("<id>", "the todo's id, as printed by list")
    .addHelpText(
      "after",
      examples(["todo-cat reopen 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"]),
    )
    .action(async (id: string) => {
      const out = output();
      const todo = await updateTodo(await requireSession(), id, {
        done: false,
      });
      out.result(`Reopened ${todoLine(todo)}`, todo);
    });

  program
    .command("delete")
    .alias("rm")
    .description("delete a todo for good; requires --yes")
    .argument("<id>", "the todo's id, as printed by list")
    .option(
      "-y, --yes",
      "confirm the deletion (there is no prompt and no undo)",
    )
    .addHelpText(
      "after",
      examples(["todo-cat delete 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed --yes"]),
    )
    .action(async (id: string, options: { yes?: boolean }) => {
      const out = output();
      if (!options.yes) {
        throw new CliError(
          "usage",
          `Refusing to delete ${id} without --yes; deleting cannot be undone`,
        );
      }
      await deleteTodo(await requireSession(), id);
      out.result(`Deleted ${id}.`, { id, deleted: true });
    });

  return program;
}

// Runs the CLI and returns the exit code; never throws.
export async function run(argv: string[]): Promise<number> {
  const json = argv.includes("--json");
  try {
    await buildProgram().parseAsync(argv);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help and --version end with a CommanderError too, with exit code 0.
      if (error.exitCode === 0) return 0;
      const message = error.message.replace(/^error: /, "");
      const cliError = new CliError(
        "usage",
        `${message}; see \`todo-cat --help\``,
      );
      printError(cliError, json);
      return cliError.exitCode;
    }
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(
            "internal",
            error instanceof Error ? error.message : String(error),
          );
    printError(cliError, json);
    return cliError.exitCode;
  }
}
