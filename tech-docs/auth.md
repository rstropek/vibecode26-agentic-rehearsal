# Authentication

## Approach

- Better Auth 1.7.7 (`better-auth`, `@better-auth/drizzle-adapter`, and the `auth` CLI, all pinned exactly) with email and password only.
- `lib/auth.ts` builds the `auth` instance on the Drizzle `db` from `lib/db.ts`; Better Auth reads `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from the environment.
- `app/api/auth/[...all]/route.ts` mounts Better Auth's HTTP API under `/api/auth/*`, which the CLI and later clients call.
- Plugins: `bearer` (the REST API and the CLI send `Authorization: Bearer <session token>`), `deviceAuthorization` (the CLI logs in like `gh auth login`), and `nextCookies` last.
- The device flow accepts only the client id `todo-cat-cli` and points users at `/device`, where they approve the CLI's login; see [cli.md](cli.md).

## The one session reader

- `getUserId(headers)` in `lib/session.ts` maps a request's headers to the signed-in user's id, from the session cookie or a bearer token, or returns null.
- Every adapter (pages, REST, agent tools, MCP) calls it; nothing else calls `auth.api.getSession`, so changing how sessions are resolved touches one function.
- Pages pass `await headers()`, route handlers pass `request.headers`; anything else about the user is loaded from the database by id (see `app/page.tsx`).
- `/` redirects to `/login` without a session; `/login` and `/signup` redirect to `/` with one, or to their `?next=` path, which `safeNext` (`lib/safe-next.ts`) limits to this site.

## Pages and forms

- `/signup` and `/login` are Server Components with small client forms that call the Server Actions in `app/auth-actions.ts` through `useActionState`.
- The actions call `auth.api.signUpEmail` / `signInEmail` / `signOut`; `nextCookies` copies Better Auth's `Set-Cookie` into the Server Action response.
- Better Auth's `APIError` messages are shown as the form error; the password is never sent back to the form.
- Shared form styling lives in `components/ui/` (`Field`, `Button`, `FormError`, `TextLink`, `PageShell`); pages compose these instead of repeating class strings.
- Colors are theme tokens in `app/globals.css` (`ink`, `paper`, `amber`, ...) with a dark-mode set, so components use `text-ink` rather than hex values.

## Schema and migrations

- `lib/auth-config.ts` holds every option except the database, shared by `lib/auth.ts`, the tests, and `db/auth-cli.ts`, so the three cannot drift.
- `npm run auth:generate` runs the Better Auth CLI on `db/auth-cli.ts` and writes `db/auth-schema.ts`, which `db/schema.ts` re-exports; never edit the generated file by hand.
- After adding a plugin or auth option that changes tables, run `npm run auth:generate`, then the normal `db:generate` / `db:migrate` flow from [database.md](database.md).
- The schema uses Drizzle relations v2 (`authRelations`, passed to `drizzle()` in `lib/db.ts`), so the adapter is imported from `@better-auth/drizzle-adapter/relations-v2`.

## Tests

- `lib/auth.test.ts` migrates a temp database, signs up and in through the real `auth`, and checks `getUserId` for a cookie, a bearer token, and neither.
- The `testUtils` plugin lives only in a test-only instance built from `authConfig` on the same database; its sessions are valid for the real `auth` because both share the secret and cookie name.
- `e2e/auth.spec.ts` drives the real sign-up, sign-out, and sign-in flow; the e2e server gets `BETTER_AUTH_URL` set to its own random port in `playwright.config.ts`.

## Gotchas

- The Better Auth CLI cannot load any module graph that imports `server-only` (it reports a "remove import 'server-only'" error), which is why it loads `db/auth-cli.ts` instead of `lib/auth.ts`.
- `auth generate --adapter drizzle` ignores the configured adapter and emits Drizzle relations v1, which drizzle-orm v1 no longer exports; `db/auth-cli.ts` therefore uses the relations-v2 adapter on `drizzle.mock()`.
- The mock database has no tables, so `db/auth-cli.ts` sets `advanced.database.validateSchema: false`; the real `auth` keeps the check and fails requests if `db/schema.ts` lacks a Better Auth table.
- The CLI writes unsorted imports, so `auth:generate` runs `biome check --write` on the output; the `MODULE_TYPELESS_PACKAGE_JSON` warning it prints is harmless.
- `nextCookies` must stay the last plugin, so `lib/auth.ts` appends it after `authConfig.plugins` and the test instance does not include it.
- Next.js renders its own empty `role="alert"` route announcer, so e2e tests match the form error by text, not by role alone.
- Server Actions calling `auth.api.*` bypass Better Auth's HTTP rate limiter and origin check; Next.js's own Server Action origin check covers CSRF.
