# CLI

`todo-cat` (workspace `cli/`, package `todo-cat-cli`) is a client of the REST API and of Better Auth's HTTP API, never of the database.
Its main users are AI agents working for a human, so it is built to be scripted: stable error codes, exit codes, JSON, no prompts.

## Using it

- `npx todo-cat --help` from the repo root after `npm install`, with `npm run dev` running; every command has its own `--help` with examples.
- `TODO_CAT_URL` picks the server (default `http://localhost:3000`); `XDG_CONFIG_HOME` (`%APPDATA%` on Windows) moves the config directory.
- The project skill `.claude/skills/todo-cat-cli/` teaches agents the workflows and pitfalls (login, finding ids by title, jq, dates, deletes); update it when commands or conventions change.
- The commands live in `cli/src/program.ts`; `app/device/` is the web page where a signed-in user approves or denies a login code.

## Design decisions

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
- It creates the user and a session cookie with Better Auth's `testUtils` before the server starts, then approves the device code over HTTP like the approval page does.
- `e2e/device.spec.ts` covers the approval page itself, including the sign-up detour.

## Gotchas

- The bin is the committed shim `cli/bin/todo-cat.js`, because npm skips linking a bin whose file does not exist yet, and `dist/` only appears when `prepare` runs after linking.
- Commander 15 is ESM only and needs Node 22.12 or newer; the workspace is `"type": "module"`.
- `--json` is a program option that commander also recognizes after the command name; read it with `program.opts()`, not the command's options.
- Better Auth's `/device/approve` needs a prior `GET /device` by the same session (the claim), and its origin check requires an `Origin` header on cookie requests, which is why the test sends both.
- Vitest sets `NODE_ENV=test`, which Next.js does not support, so the test starts the server with `NODE_ENV=development`.
