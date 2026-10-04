# CLI

`todo-cat` (workspace `cli/`, package `todo-cat-cli`) is a client of the REST API and of Better Auth's HTTP API, never of the database.
Its main users are AI agents working for a human, so it is built to be scripted: stable error codes, exit codes, JSON, no prompts.

## Using it

- `npx todo-cat --help` from the repo root after `npm install`; every command has its own `--help` with examples.
- Commands: `login`, `logout`, `whoami`, `list` (`ls`), `show`, `add`, `edit`, `done`, `reopen`, `delete` (`rm`, needs `--yes`).
- `TODO_CAT_URL` picks the server (default `http://localhost:3000`); `XDG_CONFIG_HOME` (`%APPDATA%` on Windows) moves the config directory.

## Layout

- `cli/src/program.ts`: the commander program, help texts, and `run()`, which maps every failure to an exit code.
- `cli/src/api.ts`: the `/api/todos` client; `cli/src/auth.ts`: login, session, and logout through Better Auth's client.
- `cli/src/errors.ts`: `CliError`, the error codes, and the exit code table that `--help` prints.
- `cli/src/config.ts`: server URL and the token store; `cli/src/output.ts`: text and JSON output.
- `app/device/`: the web page where a signed-in user approves or denies a login code.

## Design decisions

- Every input is parsed with the contract schema before the request and every response after it, so a bad argument fails without a request and a server that changed shape fails loudly as `unexpected-response`.
- Errors go to stderr as `todo-cat: <message> [<code>]`, or with `--json` as the API's error body `{ error: { code, message } }`; the code is the API's code when the server sent one, plus CLI codes such as `usage` and `server-unreachable`.
- Each error code has one exit code (`exitCodes` in `cli/src/errors.ts`); agents branch on the exit code or the code, never on the message.
- `--json` prints exactly one JSON value on stdout, except `login`, which prints one JSON line with the code and one with the user.
- Nothing prompts: destructive `delete` refuses without `--yes` (exit 2), and `edit` without a change is a usage error.
- `login` uses Better Auth's device authorization flow (RFC 8628) with client id `todo-cat-cli`: it prints the code and URL, never opens a browser, polls at the server's interval, and stores the session token.
- Better Auth's typed client (`better-auth/client` with `deviceAuthorizationClient`) talks to `/api/auth`, so its response shapes are not re-declared; it uses the REST client's `send`, so a connection failure is `server-unreachable` there too.
- Tokens are stored per server origin in `<config>/todo-cat/credentials.json` (file 0600, directory 0700, written via a temp file and rename), so a token is never sent to another server and never printed.
- `logout` signs out on the server (the session row is deleted) and then forgets the token; it removes the local token even when revocation fails, and then exits with that error.
- A new `login` revokes the previous session for that server, so repeated logins leave no live sessions behind.

## The approval page

- `/device` sends signed-out users through `/login?next=...` (or sign-up) and back; `safeNext` in `lib/safe-next.ts` only allows paths on this site.
- Rendering `/device?user_code=...` calls `auth.api.deviceVerify`, which claims the code for the signed-in session; only that session may then approve or deny it.
- Approve and Deny are one form posting to the `decideDevice` Server Action in `app/device/actions.ts`, which redirects to `/device?result=approved|denied|failed`.

## Build

- esbuild bundles `cli/src/main.ts` with all dependencies, including the contract's TypeScript source, into `cli/dist/todo-cat.js` (gitignored); Node cannot import the contract's extensionless TS imports itself.
- The `prepare` script builds it on `npm install`, and the root `npm run build` builds it too.

## Tests

- `cli/src/cli.test.ts` builds the CLI, starts `next dev` on a spare port with a temp database and the dist dir `.next-cli-test`, and drives the built binary through login, whoami, add, list, done, delete, logout, and a failing whoami.
- The test creates the user and a session cookie with Better Auth's `testUtils` before the server starts, then approves the device code over HTTP like the approval page, and checks that the old token gets 401 after logout.
- `e2e/device.spec.ts` covers the approval page itself, including the sign-up detour.

## Gotchas

- The bin is the committed shim `cli/bin/todo-cat.js`, because npm skips linking a bin whose file does not exist yet, and `dist/` only appears when `prepare` runs after linking.
- Commander 15 is ESM only and needs Node 22.12 or newer; the workspace is `"type": "module"`.
- `--json` is a program option; commander recognizes it after the command name too, and `run()` also checks `argv` for it so parse errors are JSON as well.
- `exitOverride()` makes `--help` and `--version` throw a `CommanderError` with exit code 0, which `run()` treats as success.
- Better Auth's `/device/approve` needs a prior `GET /device` by the same session (the claim), and its origin check requires an `Origin` header on cookie requests, which is why the test sends both.
- Vitest sets `NODE_ENV=test`, which Next.js does not support, so the test starts the server with `NODE_ENV=development`.
