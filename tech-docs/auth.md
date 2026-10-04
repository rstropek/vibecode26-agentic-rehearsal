# Authentication

## Approach

- Better Auth (`better-auth`, `@better-auth/drizzle-adapter`, and the `auth` CLI, all pinned to the same exact version) with email and password only.
- `lib/auth.ts` builds the `auth` instance on the Drizzle `db` from `lib/db.ts`; `app/api/auth/[...all]/route.ts` mounts Better Auth's HTTP API under `/api/auth/*`, which the CLI calls.
- The `bearer` plugin lets the REST API and the CLI authenticate with `Authorization: Bearer <session token>`; the `deviceAuthorization` plugin backs `todo-cat login` (see [cli.md](cli.md)).

## The one session reader

- `getUserId(headers)` in `lib/session.ts` maps a request's headers to the signed-in user's id, from the session cookie or a bearer token, or returns null.
- Every adapter calls it; nothing else calls `auth.api.getSession`, so changing how sessions are resolved touches one function.
- Pages pass `await headers()`, route handlers pass `request.headers`; anything else about the user is loaded from the database by id (see `app/page.tsx`).
- `/` redirects to `/login` without a session; `/login` and `/signup` redirect to `/` with one, or to their `?next=` path, which `safeNext` (`lib/safe-next.ts`) limits to this site.

## Pages and forms

- `/signup` and `/login` are Server Components with small client forms that call the Server Actions in `app/auth-actions.ts` through `useActionState`.
- Shared form styling lives in `components/ui/` (`Field`, `Button`, `FormError`, `TextLink`, `PageShell`); pages compose these instead of repeating class strings.
- Colors are theme tokens in `app/globals.css` (`ink`, `paper`, `amber`, ...) with a dark-mode set, so components use `text-ink` rather than hex values.

## Schema and migrations

- `lib/auth-config.ts` holds every option except the database, shared by `lib/auth.ts`, the tests, and `db/auth-cli.ts`, so the three cannot drift.
- `npm run auth:generate` runs the Better Auth CLI on `db/auth-cli.ts` (it cannot load anything that imports `server-only`) and writes `db/auth-schema.ts`, which `db/schema.ts` re-exports; never edit the generated file by hand.
- After adding a plugin or auth option that changes tables, run `npm run auth:generate`, then the normal `db:generate` / `db:migrate` flow from [database.md](database.md).
- The schema uses Drizzle relations v2 (`authRelations`, passed to `drizzle()` in `lib/db.ts`), so the adapter is imported from `@better-auth/drizzle-adapter/relations-v2`.

## Tests

- `lib/auth.test.ts` signs up and in through the real `auth` on a temp database and checks `getUserId` for a cookie, a bearer token, and neither.
- Tests that need a signed-in user build a second instance from `authConfig` plus the `testUtils` plugin on the same database; its sessions are valid for the real `auth` because both share the secret and cookie name.

## Gotchas

- `auth generate --adapter drizzle` ignores the configured adapter and emits Drizzle relations v1, which drizzle-orm v1 no longer exports; `db/auth-cli.ts` therefore uses the relations-v2 adapter on `drizzle.mock()`.
- The real `auth` validates the schema and fails requests if `db/schema.ts` lacks a Better Auth table, e.g. after adding a plugin without `auth:generate`.
- The CLI writes unsorted imports, so `auth:generate` runs `biome check --write` on the output; the `MODULE_TYPELESS_PACKAGE_JSON` warning it prints is harmless.
- `nextCookies` must stay the last plugin, so it is appended in `lib/auth.ts` rather than listed in `authConfig`.
- Server Actions calling `auth.api.*` bypass Better Auth's HTTP rate limiter and origin check; Next.js's own Server Action origin check covers CSRF.
- A `BETTER_AUTH_SECRET` shorter than 32 characters only logs a warning, so the `change-me` placeholder from `.env.example` works but is not a secret.
