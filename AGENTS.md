<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# todo-cat

A to-do list web app whose lists are kept by Lissie, a cat with attitude: a Mastra agent you chat with on `/`.
Next.js 16 App Router app at the repo root with Drizzle ORM on SQLite and Better Auth (email and password), plus npm workspaces `contract/` (shared zod schemas) and `cli/` (the `todo-cat` CLI, a REST client for agents and humans, which also serves its commands as MCP tools with `todo-cat mcp --stdio`).
All todo logic lives in `lib/todo-service.ts`; the REST adapter `/api/todos` (`app/api/todos/`) exposes it and the CLI calls that.
The app is also a remote MCP server at `/api/mcp` (`app/api/mcp/`, `lib/mcp-server.ts`) with the same tools as the stdio one (both from `contract/src/tools.ts`), protected by OAuth with Better Auth as the authorization server and its consent page at `/consent`.
Lissie (`lib/lissie.ts`) runs on OpenRouter with Mastra memory and is served to a CopilotKit chat on `/` through `/api/copilotkit`; her tools (`lib/lissie-tools.ts`) list, add, and complete the signed-in user's todos and show their progress as an A2UI card in the chat (built in `lib/lissie-cards.ts`, catalog in `app/lissie-catalog.tsx`).
Lissie's runs are traced through the Mastra instance in `lib/mastra.ts` to the OTLP endpoint in `OTEL_EXPORTER_OTLP_ENDPOINT`, in development the Aspire dashboard.
Next to the chat, the list (`app/todo-list.tsx`) adds, checks off, reopens, and deletes todos through Server Actions (`app/todo-actions.ts`) and refreshes when Lissie changes something.
Not built yet: editing a todo's title or due date in the web app.
`README.md` is still the create-next-app boilerplate; this file, `tech-docs/`, and `PRODUCT.md` (users, purpose, and Lissie's voice, for design work) are the project docs.

## First-time setup

- `cp .env.example .env` and set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `OPENROUTER_API_KEY`; nothing that opens the database starts without `DATABASE_URL`.
- `npm run db:migrate` creates `data/app.db`; `npm run db:seed` adds the demo user.
- `npx playwright install chromium` once per machine before the e2e tests or `npm run qa`.

## Commands

- `npm install` installs the root app and both workspaces.
- `npm run dev` starts the dev server on http://localhost:3000.
- `npm run build` creates a production build of the app and bundles the CLI into `cli/dist/`.
- `npx todo-cat --help` runs the CLI against `TODO_CAT_URL` (default http://localhost:3000); `npm run build -w cli` rebuilds it.
- `npm test` runs the Vitest unit and integration tests once.
- `npm run test:e2e` runs the Playwright end-to-end tests in Chromium against its own dev server.
- `npm run test:e2e:model` runs the e2e tests that call the real model (needs `OPENROUTER_API_KEY`); they are not part of QA or CI.
- `npm run test:e2e:model:todos` runs only the model e2e where Lissie adds "buy milk" and the list next to the chat shows it.
- `npm run dashboard:start` starts the Aspire dashboard in Docker (UI on http://localhost:18888, OTLP on 4317 and 4318) for Lissie's traces; `npm run dashboard:stop` stops it.
- `npm run db:generate` turns schema changes in `db/schema.ts` into a migration in `db/migrations/`.
- `npm run db:migrate` applies pending migrations to the database in `DATABASE_URL`.
- `npm run db:reset` deletes the local database file and migrates a fresh one.
- `npm run db:seed` creates the demo user `demo@todo-cat.dev` (password `cat-person-2026`) and resets their todos; safe to rerun.
- `npm run auth:generate` regenerates Better Auth's Drizzle tables in `db/auth-schema.ts` after auth plugins or options change.
- `npm run lint` runs `biome check` (lint, format, import order).
- `npm run typecheck` generates Next.js route types and type-checks the app and both workspaces in one root `tsc`.
- `npm run qa` runs every check (Biome, typecheck, build, Vitest, Playwright) across the app and both workspaces, printing a PASS line per passing check and the full output of failing ones.
- `npx biome check --write` applies Biome's safe fixes and formatting.

## Definition of done

- Run `npm run qa` before you call a task done, and keep going until it passes.
- Fix the code instead of suppressing findings: no `biome-ignore`, `@ts-expect-error`, `any`, skipped tests, or loosened config to get green.

## Newer than your training data

- Next.js 16, React 19.2, Tailwind 4, Biome 2, Drizzle v1 (RC), Better Auth 1.7, Mastra 1.x and CopilotKit 1.77 (v2 API) have changed since your training data, so verify APIs against current docs instead of memory.
- `PageProps<"/route">`, `LayoutProps<"/route">`, and `RouteContext<"/route">` are global types generated by `next typegen`, so don't import them, and run `npm run typecheck` once on a fresh checkout before an editor resolves them.

## Researching docs

- Next.js: read the docs for the installed version in `node_modules/next/dist/docs/`, not the website, which may describe another version.
- Vendors with an `llms.txt` index: start there and follow its links, e.g. https://orm.drizzle.team/llms.txt for Drizzle (use the `docs/sqlite/` pages, which target the v1 RC installed here) and https://better-auth.com/llms.txt for Better Auth.
- Libraries with an installed skill (`.claude/skills/`): use the skill, e.g. `mastra`, `copilotkit`, and `impeccable` or `frontend-design` for UI work.
- MCP: start at https://modelcontextprotocol.io/llms.txt and read the current revision (2026-07-28), and the SDK's own index at https://ts.sdk.modelcontextprotocol.io/v2/llms.txt for `@modelcontextprotocol/server` and `/client` v2.
- Any other library: use the ctx7 CLI described in the `find-docs` skill (`npx ctx7@latest library <name> "<question>"`, then `docs <id> "<question>"`).
- When docs and installed code disagree, the type definitions in `node_modules/` win.

## Tech docs

`tech-docs/` holds project-specific technical docs, written primarily for agents.

- Describe approach, principles, design decisions with their reasons, and gotchas.
- Point to the central files instead of copying code.
- Leave out anything an agent finds out by reading the code.
- Describe the current state only; delete outdated content instead of adding caveats.

Index:

- [tech-docs/architecture.md](tech-docs/architecture.md): the todo service, its ownership rules, the contract, adapters (built and planned), and running `lib/` code from scripts.
- [tech-docs/workspaces.md](tech-docs/workspaces.md): workspace layout, why the workspaces exist, and their gotchas.
- [tech-docs/database.md](tech-docs/database.md): Drizzle on SQLite, the single db module, migrations, and their gotchas.
- [tech-docs/testing.md](tech-docs/testing.md): test strategy, QA script, CI, and gotchas for Vitest and Playwright.
- [tech-docs/auth.md](tech-docs/auth.md): Better Auth setup, the single `getUserId` session reader, auth pages, schema generation, and gotchas.
- [tech-docs/rest-api.md](tech-docs/rest-api.md): the `/api/todos` endpoints, getting a bearer token with curl, and the adapter's design decisions.
- [tech-docs/agent.md](tech-docs/agent.md): Lissie's model, memory and threads, her tools and how they get the user id, the A2UI progress card, the CopilotKit runtime and its route authorization, history replay, and the chat UI with the list next to it.
- [tech-docs/observability.md](tech-docs/observability.md): tracing Lissie's runs over OTLP, the Aspire dashboard scripts, what a trace holds, and why tracing is off in tests.
- [tech-docs/ui.md](tech-docs/ui.md): the "Scratched off" design direction, where tokens and shared components live, the list's interaction details, the progress card, and the CopilotKit styling gotchas.
- [tech-docs/mcp.md](tech-docs/mcp.md): both MCP servers and how they differ, the shared tool definitions, OAuth with CIMD clients, discovery, login and consent, connecting Claude Code and the MCPJam CLI, tests, and gotchas.
- [tech-docs/cli.md](tech-docs/cli.md): the `todo-cat` CLI, its commands shared with the stdio MCP server and how to register that in Claude Code, its device-flow login and `/device` approval page, output and exit-code conventions, the `todo-cat-cli` agent skill, build, and tests.

## Keeping this map current

- When a change invalidates a line here or in `tech-docs/`, or teaches a costly lesson, update AGENTS.md and the tech docs in the same change.
- Prefer deleting over adding, pointers over prose, one sentence per bullet.
