# Database

## Approach

- Drizzle ORM on SQLite through `@libsql/client`, stored in the local file named by `DATABASE_URL` (`file:./data/app.db`, gitignored via `data/.gitignore`).
- `lib/db.ts` is the only module that opens the database; everything else imports its `db`, and its `server-only` import makes the build fail if client code imports it.
- Tables live in `db/schema.ts` and migrations in `db/migrations/`, configured in `drizzle.config.ts`; Better Auth's tables are generated into `db/auth-schema.ts` (see [auth.md](auth.md)) and re-exported next to `todos`.
- Mastra memory keeps its own `mastra_*` tables in the same file through `db.$client`, and creates them itself on first use; they are not in `db/schema.ts` or `db/migrations/` (see [agent.md](agent.md)).
- Schema changes go through `npm run db:generate`, a review of the generated SQL, then `npm run db:migrate`; tests and the e2e server migrate their own temp databases, but `data/app.db` needs `db:migrate` by hand.

## Design decisions

- Drizzle is the v1 release candidate, not the 0.x `latest`, because the Drizzle docs already describe v1 and its migration layout differs; versions are pinned exactly because RCs can break between releases.
- Migrations are generated SQL files rather than `drizzle-kit push`, so the same reviewed files run locally, in tests, in e2e, and in production.
- `lib/db.ts` imports `drizzle-orm/libsql/node` instead of `drizzle-orm/libsql`, because the generic entry switches clients based on bundler conditions and only the Node client opens `file:` URLs.
- `drizzle.config.ts` and the scripts in `scripts/` load env files with `@next/env`, so they read the same `.env*` files as Next.js and a `DATABASE_URL` set by the caller wins.
- `db:reset` refuses any `DATABASE_URL` that is not a `file:` URL, so it can never wipe a remote database.

## Tests

- Tests that touch the database stub `DATABASE_URL` to a temp file, import the real `lib/db.ts`, and apply every migration with Drizzle's runtime migrator (`lib/db.test.ts`).
- The Playwright web server runs `drizzle-kit migrate` against its own temp database before `next dev` starts; see `playwright.config.ts` and [testing.md](testing.md).

## Gotchas

- v1 writes one folder per migration (`migration.sql` plus `snapshot.json`) and no `meta/_journal.json`; the migrator rejects old journal-style folders until `drizzle-kit up` converts them.
- `drizzle-kit generate --custom` writes a comment line without a trailing newline; SQL appended on that line is commented out and the migration fails with `SQLITE_UNKNOWN_0: not an error`.
- In v1 the SQLite `drizzle()` takes `relations` and no longer accepts `schema`; `lib/db.ts` passes Better Auth's `authRelations` part, and app relations built with `defineRelations` must come before it (`{ ...relations, ...authRelations }`).
- `@next/env` is CommonJS, so plain-Node scripts such as `scripts/db-reset.mts` must use its default export.
- Relative `file:` paths resolve against the working directory, so run database commands from the repo root.
- `next build` prerenders static pages, so a page that queries `db` without dynamic APIs runs that query at build time.
