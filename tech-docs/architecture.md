# Architecture

todo-cat has one piece of business logic, the todo service, and several thin adapters
around it. Hexagonal (ports and adapters), without the ceremony.

```
 browser pages ─┐
 REST /api/todos ┤                       ┌──────────────┐
 agent tools  ───┼── getUserId(headers) ─▶ todo service ├──▶ lib/db.ts ──▶ SQLite
 MCP over HTTP ──┘                       └──────┬───────┘
                                                │ types and schemas
 CLI and stdio MCP ──▶ REST /api/todos     contract/ (@todo-cat/contract, zod)
```

Built: the service, the REST adapter, the CLI with its stdio MCP server, MCP over HTTP ([mcp.md](mcp.md)), Lissie's
chat with her tools ([agent.md](agent.md)), and the list on `/` with its Server Actions.

## The todo service

- One module, `lib/todo-service.ts`, holds every todo query and rule. Nothing else
  touches the `todos` table.
- Use cases, not tables: list, get, add, update, delete.
- **Every function takes the user id first, and every query filters by it.** There is
  no function that reads or writes todos without an owner.
- Another user's todo is "not found", never "forbidden", with the identical message:
  the API must not reveal that an id exists. Ids are random UUIDs for the same reason.
- The service returns contract types (plain objects, dates as ISO strings), never
  Drizzle rows.
- Rule violations are `TodoError`s with a few stable codes (`todo-not-found`,
  `validation-failed`). Adapters map them; they don't invent their own.
- A due date is a calendar day and stays a `yyyy-mm-dd` string everywhere, never a
  JavaScript `Date`, which is midnight UTC and shows the previous day west of Greenwich.

## The contract

- The `contract/` workspace (`@todo-cat/contract`) holds the zod schemas for todos,
  inputs, list filters, and the error body `{ error: { code, message } }`.
- Input types are the schemas' output types (titles trimmed, `status` defaulted), except
  `TodoFilter`, which is the input type so callers may omit `status`.
- Server and clients import the same schemas. The CLI parses every response with
  them, so a server change that breaks the shape fails loudly in the client.
- Validation lives in the schemas, at the adapter boundary. The service trusts its
  typed input but always enforces ownership.

## Adapters

- An adapter does four things: parse the input with a contract schema through the
  service's `parseInput` (so a bad input is always `validation-failed`), resolve the user
  with `getUserId` (from `lib/session.ts`), call the service, map errors to its protocol.
  MCP over HTTP is the exception to `getUserId`: its user is the verified OAuth access token's subject.
  No business rules in adapters.
- **REST** (`/api/todos`): for non-browser clients. Bearer token or session cookie;
  see [rest-api.md](rest-api.md).
- **CLI** (`cli/`): a client of the REST API, never of the database; see [cli.md](cli.md).
- **Pages**: Server Components and Server Actions that call the service directly, not the
  REST API. `/` reads the list, and the Server Actions in `app/todo-actions.ts` add, check off,
  reopen, and delete; a visitor without a session is redirected to `/login` before any input is
  read, and a `TodoError` becomes a message for the list (see [ui.md](ui.md)).
- **Agent tools** (`lib/lissie-tools.ts`): call the service directly. The user id comes from
  the server session through Mastra's request context, never from a tool argument the model
  fills in. Mastra validates tool input against the contract schema before the executor runs
  and returns the error to the model, so the tools skip `parseInput`; a `TodoError` becomes
  the contract's error body as the tool result. See [agent.md](agent.md).
- **MCP over stdio** (`todo-cat mcp --stdio`): inside the CLI, so a REST client again; its tools are
  the CLI's commands in `cli/src/commands.ts`. See [cli.md](cli.md).
- **MCP over HTTP** (`POST /api/mcp`): inside the app, calling the service like the REST routes, for the user of
  an OAuth access token. Both MCP servers take their tools from `contract/src/tools.ts`; see [mcp.md](mcp.md).

## Deliberately not done

- No generic repository, unit of work, or DI container. The service module is the seam;
  tests run it against a temp SQLite file.
- No pagination, sharing between users, soft delete, or optimistic concurrency.

## Tests

- The service is tested against a temp database with **two users for every use case**:
  one user never sees, changes, or deletes the other's todos (`lib/todo-service.test.ts`).
- Adapter tests cover only the mapping: 401 without a user, error codes, status codes.
- The Server Actions are tested the same way in `app/todo-actions.test.ts`, with a redirect instead of a 401.

## Gotchas

- Text search uses `instr(lower(...))` rather than `LIKE`, so `%` and `_` match literally;
  SQLite's `lower()` folds only ASCII, so `Ä` does not find `ä`.
- `@libsql/client` enforces foreign keys, so deleting a user really cascades to their
  todos; a test guards this.
- Scripts that import `lib/` run through `tsx --conditions=react-server`, like `db:seed`:
  tsx resolves the `@/` alias, and the condition makes `server-only` resolve to its empty
  export outside Next.js.
- They must load `.env` with `@next/env` before dynamically importing `lib/db.ts` or
  `lib/auth.ts`, which read the environment on import (see `scripts/db-seed.mts`).
- The root package is CommonJS, so scripts with top-level `await` must be `.mts`.
