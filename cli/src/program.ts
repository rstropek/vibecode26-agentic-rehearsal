import { Command, CommanderError } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { currentUser, deviceLogin, revokeSession } from "./auth";
import { commands, type TodoCommand } from "./commands";
import { loadToken, removeToken, saveToken, serverUrl } from "./config";
import { CliError, exitCodeHelp, toCliError } from "./errors";
import { serveMcp } from "./mcp";
import { createOutput, type Output, printError, userText } from "./output";

// The CLI. The commands on the list are defined in commands.ts and added here; login, logout, and mcp are CLI-only.

const environmentHelp = `Environment:
  TODO_CAT_URL     server to talk to (default: http://localhost:3000)
  XDG_CONFIG_HOME  config directory; the session token is stored owner-only in
                   $XDG_CONFIG_HOME/todo-cat/credentials.json (default ~/.config)`;

const examples = (lines: string[]) =>
  `\nExamples:\n${lines.map((line) => `  $ ${line}`).join("\n")}`;

// Adds one of the shared commands from commands.ts: its arguments and options map to the tool input,
// and a destructive command refuses to run without --yes, since a terminal has no confirmation dialog.
function addTodoCommand(
  program: Command,
  command: TodoCommand,
  output: () => Output,
): void {
  const { cli, annotations } = command;
  const destructive = !annotations.readOnly && annotations.destructive;
  const sub = program
    .command(command.name)
    .description(
      destructive
        ? `${command.description}; requires --yes`
        : command.description,
    );
  if (cli.alias) sub.alias(cli.alias);
  for (const [name, description] of cli.arguments ?? []) {
    sub.argument(name, description);
  }
  for (const option of cli.options ?? []) sub.addOption(option);
  if (destructive) {
    sub.option("-y, --yes", "confirm (there is no prompt and no undo)");
  }
  sub.addHelpText("after", examples(cli.examples)).action(async () => {
    const out = output();
    const options = sub.opts();
    if (destructive && options.yes !== true) {
      throw new CliError(
        "usage",
        `Refusing to ${command.name} without --yes; it cannot be undone`,
      );
    }
    const { text, data } = await command.execute(
      cli.toInput(sub.args, options),
    );
    out.result(text, data);
  });
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

  for (const command of commands) addTodoCommand(program, command, output);

  program
    .command("mcp")
    .description(
      "run a Model Context Protocol server with every command above, except login and logout, as a tool",
    )
    .requiredOption("--stdio", "serve over stdin and stdout")
    .addHelpText(
      "after",
      `
For MCP hosts that start the server themselves, e.g. Claude Code:
  claude mcp add todo-cat -- npx todo-cat mcp --stdio
The server starts without a login; until \`todo-cat login\` succeeds, every tool
call fails with "unauthorized". Destructive tools are annotated instead of
asking for --yes, and errors are tool results carrying {"error":{"code","message"}}.
${examples(["todo-cat mcp --stdio", "TODO_CAT_URL=https://todo.example.com todo-cat mcp --stdio"])}`,
    )
    .action(() => serveMcp());

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
    const cliError = toCliError(error);
    printError(cliError, json);
    return cliError.exitCode;
  }
}
