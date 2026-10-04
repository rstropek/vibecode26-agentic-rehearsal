<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# todo-cat

A to-do list web app whose lists are kept by Lissie, a cat with attitude (an AI agent, coming later).
Next.js 16 App Router app at the repo root with Drizzle ORM on SQLite and Better Auth (email and password), plus npm workspaces `contract/` (shared zod schemas) and `cli/` (the `todo-cat` CLI, a REST client for agents and humans).
All todo logic lives in `lib/todo-service.ts`; the REST adapter `/api/todos` (`app/api/todos/`) exposes it and the CLI calls that, while agent tools are not built yet.

## Commands

- `npm install` installs the root app and both workspaces.
- `npm run dev` starts the dev server on http://localhost:3000.
- `npm run build` creates a production build of the app and bundles the CLI into `cli/dist/`.
- `npx todo-cat --help` runs the CLI against `TODO_CAT_URL` (default http://localhost:3000); `npm run build -w cli` rebuilds it.
- `npm test` runs the Vitest unit and integration tests once.
- `npm run test:e2e` runs the Playwright end-to-end tests in Chromium against its own dev server.
- `npm run db:generate` turns schema changes in `db/schema.ts` into a migration in `db/migrations/`.
- `npm run db:migrate` applies pending migrations to the database in `DATABASE_URL`.
- `npm run db:reset` deletes the local database file and migrates a fresh one.
- `npm run db:seed` creates the demo user `demo@todo-cat.dev` (password `cat-person-2026`) and resets their todos; safe to rerun.
- `npm run auth:generate` regenerates Better Auth's Drizzle tables in `db/auth-schema.ts` after auth plugins or options change.
- `npm run lint` runs `biome check` (lint, format, import order).
- `npm run typecheck` generates Next.js route types and type-checks all workspaces.
- `npm run qa` runs every check (Biome, typecheck, build, Vitest, Playwright) across the app and both workspaces and prints only what failed.
- `npx biome check --write` applies Biome's safe fixes and formatting.

## Definition of done

- Run `npm run qa` before you call a task done, and keep going until it passes.
- Fix the code instead of suppressing findings: no `biome-ignore`, `@ts-expect-error`, `any`, skipped tests, or loosened config to get green.

## Newer than your training data

- Next.js 16, React 19.2, Tailwind 4, Biome 2, Drizzle v1 (RC) and Better Auth 1.7 have changed since your training data, so verify APIs against current docs instead of memory.

## Researching docs

- Next.js: read the docs for the installed version in `node_modules/next/dist/docs/`, not the website, which may describe another version.
- Vendors with an `llms.txt` index: start there and follow its links, e.g. https://orm.drizzle.team/llms.txt for Drizzle (use the `docs/sqlite/` pages, which target the v1 RC installed here) and https://better-auth.com/llms.txt for Better Auth.
- Libraries with an installed skill (`.claude/skills/`): use the skill, e.g. `mastra`, `copilotkit`, and `impeccable` or `frontend-design` for UI work.
- Any other library: use the ctx7 CLI described in the `find-docs` skill (`npx ctx7@latest library <name> "<question>"`, then `docs <id> "<question>"`).
- When docs and installed code disagree, the type definitions in `node_modules/` win.

## Tech docs

`tech-docs/` holds project-specific technical docs, written primarily for agents.

- Describe approach, principles, design decisions with their reasons, and gotchas.
- Point to the central files instead of copying code.
- Leave out anything an agent finds out by reading the code.
- Describe the current state only; delete outdated content instead of adding caveats.

Index:

- [tech-docs/architecture.md](tech-docs/architecture.md): the todo service, its ownership rules, the contract, adapters, and the dev seed.
- [tech-docs/workspaces.md](tech-docs/workspaces.md): workspace layout, why the workspaces exist, and their gotchas.
- [tech-docs/database.md](tech-docs/database.md): Drizzle on SQLite, the single db module, migrations, and their gotchas.
- [tech-docs/testing.md](tech-docs/testing.md): test strategy, QA script, CI, and gotchas for Vitest and Playwright.
- [tech-docs/auth.md](tech-docs/auth.md): Better Auth setup, the single `getUserId` session reader, auth pages, schema generation, and gotchas.
- [tech-docs/rest-api.md](tech-docs/rest-api.md): the `/api/todos` endpoints, getting a bearer token with curl, and the adapter's design decisions.
- [tech-docs/cli.md](tech-docs/cli.md): the `todo-cat` CLI, its device-flow login and `/device` approval page, output and exit-code conventions, the `todo-cat-cli` agent skill, build, and tests.

## Keeping this map current

- When a change invalidates a line here or in `tech-docs/`, or teaches a costly lesson, update AGENTS.md and the tech docs in the same change.
- Prefer deleting over adding, pointers over prose, one sentence per bullet.
