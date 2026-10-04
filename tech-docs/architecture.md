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

## The todo service

- One module, `lib/todo-service.ts`, holds every todo query and rule. Nothing else
  touches the `todos` table.
- Use cases, not tables: list (filter by status open/done/all and by text), get, add,
  update (title, due date, done), delete.
- **Every function takes the user id first, and every query filters by it.** There is
  no function that reads or writes todos without an owner.
- Another user's todo is "not found", never "forbidden": the API must not reveal that
  an id exists.
- The service returns contract types (plain objects, dates as ISO strings), never
  Drizzle rows.
- Rule violations are a few typed errors with stable codes (`todo-not-found`,
  `validation-failed`). Adapters map them; they don't invent their own.
- `TodoError` carries the code; adapters parse input with `parseInput(schema, input)` from
  the service module, so a schema failure is always a `validation-failed` `TodoError`.
- A missing id and another user's id throw the identical error, message included.
- List defaults to all todos and orders open before done, then by due date (undated last),
  then oldest first.
- `add` and `update` take an optional trailing `now` for the creation or completion time;
  only tests and the dev seed pass it, so seeded todos can be backdated without touching
  the table.

## Data

- `todos` in `db/schema.ts`: id, owner (user id, cascade delete with the user), title,
  optional due date, done, created at, completed at.
- Ids are random UUIDs, so they are unguessable and say nothing about other users' todos.
- A due date is a date without time and stays an ISO `yyyy-mm-dd` string everywhere.
  A JavaScript `Date` is midnight UTC and shows the previous day west of Greenwich.
- `completed at` is set when a todo is marked done and cleared when it's reopened; marking
  a done todo done again keeps the original time.
- `npm run db:seed` (`scripts/db-seed.mts`) creates `demo@todo-cat.dev` with the password
  `cat-person-2026` through Better Auth and replaces that user's todos via the service, so
  every run ends in the same state with dates relative to today.

## The contract

- The `contract/` workspace (`@todo-cat/contract`) holds the zod schemas for todos,
  inputs, list filters, and the error body `{ error: { code, message } }`, in
  `contract/src/todos.ts` and `contract/src/errors.ts`.
- The package exports its TypeScript source; Next.js transpiles workspace packages
  without `transpilePackages`, and Vitest and tsc resolve it through the npm symlink.
- Input types are the schemas' output types (titles trimmed, `status` defaulted), except
  `TodoFilter`, which is the input type so callers may omit `status`.
- Server and clients import the same schemas. The CLI parses every response with
  them, so a server change that breaks the shape fails loudly in the client.
- Validation lives in the schemas, at the adapter boundary. The service trusts its
  typed input but always enforces ownership.

## Adapters

- An adapter does four things: parse the input with a contract schema, resolve the
  user with `getUserId` (from `lib/session.ts`), call the service, map errors to its
  protocol. No business rules in adapters.
- **REST** (`/api/todos`): for non-browser clients. Bearer token or session cookie,
  401 `unauthorized` without either, 404 `todo-not-found`, 400 `validation-failed`;
  see [rest-api.md](rest-api.md).
- **CLI** (`cli/`): a client of the REST API, never of the database; see [cli.md](cli.md).
- **Agent tools** (later): call the service directly. The user id comes from the
  server session, never from a tool argument the model fills in.
- **MCP**: over stdio inside the CLI (a REST client again), over HTTP inside the app
  (calls the service, like the REST routes).

## Deliberately not done

- No generic repository, unit of work, or DI container. The service module is the seam;
  tests run it against a temp SQLite file.
- No pagination, sharing between users, soft delete, or optimistic concurrency.

## Tests

- The service is tested against a temp database with **two users for every use case**:
  one user never sees, changes, or deletes the other's todos (`lib/todo-service.test.ts`).
- The users are inserted straight into the `user` table; the service needs only their ids.
- Adapter tests cover only the mapping: 401 without a user, error codes, status codes.

## Gotchas

- Text search uses `instr(lower(...))` rather than `LIKE`, so `%` and `_` match literally;
  SQLite's `lower()` folds only ASCII, so `Ä` does not find `ä`.
- `@libsql/client` enforces foreign keys, so deleting a user really cascades to their
  todos; a test guards this.
- The seed runs through `tsx --conditions=react-server`: tsx resolves the `@/` alias, and
  the condition makes `server-only` resolve to its empty export outside Next.js.
- The root package is CommonJS, so scripts with top-level `await` must be `.mts`.
