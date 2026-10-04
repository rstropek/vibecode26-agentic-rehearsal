# CLI

`todo-cat` (workspace `cli/`, package `todo-cat-cli`) is a client of the REST API and of Better Auth's HTTP API, never of the database.
Its main users are AI agents working for a human, so it is built to be scripted: stable error codes, exit codes, JSON, no prompts, and an MCP server over stdio.

## Using it

- `npx todo-cat --help` from the repo root after `npm install`, with `npm run dev` running; every command has its own `--help` with examples.
- `TODO_CAT_URL` picks the server (default `http://localhost:3000`); `XDG_CONFIG_HOME` (`%APPDATA%` on Windows) moves the config directory.
- The project skill `.claude/skills/todo-cat-cli/` teaches agents the workflows and pitfalls (login, finding ids by title, jq, dates, deletes); update it when commands or conventions change.
- The commands on the list are the contract's tools (`contract/src/tools.ts`) implemented in `cli/src/commands.ts`, and become both CLI commands (`cli/src/program.ts`) and MCP tools (`cli/src/mcp.ts`); `login`, `logout`, and `mcp` are CLI-only, in `program.ts`.
- The app serves the same tools over HTTP at `/api/mcp` with OAuth; [mcp.md](mcp.md) compares the two servers.
- `app/device/` is the web page where a signed-in user approves or denies a login code.

## The MCP server

- `todo-cat mcp --stdio` serves every command in `commands.ts` as an MCP tool of the same name over stdio, with the official TypeScript SDK (`@modelcontextprotocol/server`, pinned to 2.3.0) and `serveStdio`.
- Register it in Claude Code from the repo root with `claude mcp add todo-cat -- npx todo-cat mcp --stdio` (local scope: this project, for you), or `claude mcp add todo-cat -e TODO_CAT_URL=<url> -- npx todo-cat mcp --stdio` for another server; `/mcp` in Claude Code shows it, and other hosts take the same command.
- It talks to the server exactly like the CLI: the stored token for `TODO_CAT_URL`, read on every call, so it starts without a login and works once `todo-cat login` has run.
- A tool result is the command's `--json` output as one text block; a failure is a tool result with `isError: true` and the CLI's error body `{ error: { code, message } }`, in place of exit codes and stderr.
- Annotations take the place of `--yes`: `readOnlyHint` for whoami, list, and show, and `destructiveHint` only for delete, whose data cannot come back; the host decides whether to ask the user.
- It targets MCP revision 2026-07-28 and has no code for older revisions; `serveStdio` still answers 2025-era clients by default.
- Test it by hand with `npx @modelcontextprotocol/inspector npx todo-cat mcp --stdio`.

## Design decisions

- A command is a tool from the contract (name, description, input schema, annotations) plus a `run` on the REST client and a `toInput` that turns the command line into the same arguments an MCP client sends; one schema check serves both, and `commands.ts` must implement every tool of the contract to compile.
- The input schemas are contract schemas or compositions of them (e.g. `todoIdSchema` plus `updateTodoInputSchema` fields for edit), so an id that is not a UUID is `validation-failed` before any request.
- A command whose tool has `destructiveHint: true` gets `-y, --yes` in the CLI automatically and refuses to run without it.

- Errors go to stderr as `todo-cat: <message> [<code>]`, or with `--json` as the API's error body `{ error: { code, message } }`; the code is the API's code when the server sent one, plus CLI codes such as `usage` and `server-unreachable`.
- Each error code has one exit code (`exitCodes` in `cli/src/errors.ts`); agents branch on the exit code or the code, never on the message.
- `--json` prints exactly one JSON value on stdout, except `login`, which prints one JSON line with the code and one with the user.
- Nothing prompts: destructive `delete` refuses without `--yes` (exit 2), and `edit` without a change is a usage error.
- `login` uses Better Auth's device authorization flow (RFC 8628) with client id `todo-cat-cli`, the only one `lib/auth-config.ts` accepts: it prints the code and URL, never opens a browser, and polls until the code is approved.
- Better Auth's own typed client (`better-auth/client`) talks to `/api/auth`, so its request and response shapes are not re-declared in the CLI.
- Tokens are stored per server origin in `<config>/todo-cat/credentials.json`, owner-only, so a token is never sent to another server and never printed.
- `logout` and a repeated `login` revoke the old session on the server, so no live sessions are left behind; `logout` removes the local token even when revocation fails.

## The approval page

- `/device` sends signed-out users through `/login?next=...` (or sign-up) and back; `safeNext` in `lib/safe-next.ts` only allows paths on this site.
- Rendering `/device?user_code=...` calls `auth.api.deviceVerify`, which claims the code for the signed-in session; only that session may then approve or deny it.

## Build

- esbuild bundles `cli/src/main.ts` with all dependencies, including the contract's TypeScript source, into `cli/dist/todo-cat.js` (gitignored); Node cannot import the contract's extensionless TS imports itself.
- The `prepare` script builds it on `npm install`, and the root `npm run build` builds it too; after changing `cli/src/`, run `npm run build -w cli` before `npx todo-cat` sees the change.

## Tests

- `cli/src/cli.test.ts` builds the CLI, starts `next dev` on a spare port with a temp database and the dist dir `.next-cli-test`, and drives the built binary through login, whoami, add, list, done, delete, logout, and a failing whoami.
- In the same file and against the same server, an MCP client (`@modelcontextprotocol/client`, pinned to 2026-07-28) spawns `todo-cat mcp --stdio` and checks the tools and their annotations, add, list, done, an API error as a tool error, and a server without a login.
- It creates the user and a session cookie with Better Auth's `testUtils` before the server starts, then approves the device code over HTTP like the approval page does.
- `e2e/device.spec.ts` covers the approval page itself, including the sign-up detour.

## Gotchas

- The bin is the committed shim `cli/bin/todo-cat.js`, because npm skips linking a bin whose file does not exist yet, and `dist/` only appears when `prepare` runs after linking.
- Commander 15 is ESM only and needs Node 22.12 or newer; the workspace is `"type": "module"`.
- `--json` is a program option that commander also recognizes after the command name; read it with `program.opts()`, not the command's options.
- Better Auth's `/device/approve` needs a prior `GET /device` by the same session (the claim), and its origin check requires an `Origin` header on cookie requests, which is why the test sends both.
- Arguments that do not match a tool's input schema are rejected by the SDK before the command runs, as a tool error with its own `Input validation error: ...` text instead of the error body; everything after that check carries a code.
- The MCP server must write nothing but protocol to stdout, so `serveMcp` points `console.log`, `info`, and `debug` at stderr, and nothing in `commands.ts` prints.
- Vitest sets `NODE_ENV=test`, which Next.js does not support, so the test starts the server with `NODE_ENV=development`.
