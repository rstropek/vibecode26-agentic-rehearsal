# Testing

## Strategy

- Vitest runs unit and integration tests in jsdom: pure functions, zod schemas, CLI logic, and synchronous React components; database and auth tests switch to the node environment per file.
- Playwright runs end-to-end tests in Chromium against a real `next dev` server, and covers everything Vitest cannot render, notably async Server Components, routing, and Server Actions.
- Prefer a Vitest test whenever the code can run outside Next.js, and add an e2e test only for flows a user actually goes through.

## Commands

- `npm test` runs Vitest once; `npm run test:watch` runs it in watch mode.
- `npm run test:e2e` runs Playwright; pass a file or `--ui` after `--`, e.g. `npm run test:e2e -- --ui`.
- `npx playwright install chromium` downloads the browser on a fresh machine.

## QA script

- `scripts/qa.sh` (`npm run qa`) is the single gate for agents, humans, and CI: Biome, typecheck, production build, Vitest, Playwright, in that order.
- Every section runs even after an earlier one fails, so one run reports all problems at once.
- Passing sections print one PASS line; failing sections print their full output, then a summary lists every section and the exit code is 1.
- The complete output of all sections goes to `.qa/qa.log` (gitignored); set `QA_LOG` to write it elsewhere.
- Output is plain for agents: `NO_COLOR` is set, Biome runs with `--colors=off`, and tsc with `--pretty false` so errors read `file(line,col)`.
- `npm run typecheck` runs `next typegen` first because `tsc` needs the generated `next-env.d.ts` and route types, which a fresh checkout lacks.
- To add a check, add a `section <name> <command>` line to the script rather than a separate CI step, so local and CI never drift apart.

## CI

- `.github/workflows/qa.yml` runs `npm run qa` on every push and pull request with Node 24 and `npm ci`; it deploys nothing.
- Playwright browsers are cached by Playwright version; on a cache hit only the system packages are installed.
- CI writes `.env` from `.env.example`, replacing every `*_SECRET`, `*_KEY`, and `*_TOKEN` value with a random dummy, so new secrets need only an entry in `.env.example` and real secrets never reach CI.
- On failure the workflow uploads `.qa/qa.log` as the `qa-log` artifact.

## Conventions

- Vitest picks up `*.test.ts(x)` anywhere in the repo, workspaces included, so colocate tests with the code they cover.
- Playwright specs live in `e2e/` as `*.spec.ts`, and Vitest excludes that folder.
- Query by role or label (`getByRole`, `getByLabel`) in both tools, so the tests double as an accessibility check.

## Design decisions

- One root `vitest.config.mts` covers all workspaces, matching the single root `biome.json` and lockfile.
- Path aliases come from Vite's built-in `resolve.tsconfigPaths`, so the `vite-tsconfig-paths` plugin from the Next.js guide is unnecessary.
- E2E runs against `next dev` instead of a production build because it starts faster and needs no build step.
- The e2e server shares nothing with `npm run dev` or another checkout running at the same time: it asks the OS for a free port, builds into its own dist dir, gets `DATABASE_URL` pointing at a fresh temp file that `drizzle-kit migrate` sets up before `next dev` starts, gets `BETTER_AUTH_URL` set to its own port, and never reuses an existing server.
- Override these with `E2E_PORT`, `E2E_DIST_DIR` (default `.next-e2e`), and `E2E_DATABASE_URL`; see `playwright.config.ts`.

## Gotchas

- Next.js 16 allows only one `next dev` per dist directory and exits if a second one starts, so the e2e server builds into `.next-e2e/` via the `NEXT_DIST_DIR` env var read in `next.config.ts`.
- `next dev` adds the type paths of its dist directory to `tsconfig.json` and reformats the file, which is why the `.next-e2e` includes are committed there.
- Playwright re-evaluates its config in each worker process, so the port and database path are stored in `E2E_*` env vars once and inherited.
- Next.js loads `.env` without overriding variables already set, so the e2e `DATABASE_URL` and `BETTER_AUTH_URL` win over the ones in `.env`.
- A non-default `E2E_DIST_DIR` makes `next dev` add that folder's type paths to `tsconfig.json`; don't commit that change.
- `vitest.setup.ts` stubs `server-only`, which otherwise throws when a test imports a server module such as `lib/db.ts`.
- Vitest does not load `.env`, so tests that import `lib/db.ts` or `lib/auth.ts` stub `DATABASE_URL` and the `BETTER_AUTH_*` variables before a dynamic import; see `lib/auth.test.ts`.
- Testing Library's automatic cleanup needs Vitest globals, which are off, so `vitest.setup.ts` calls `cleanup()` after each test.
- Vitest cannot render async Server Components; test them through Playwright.
- Vitest 5 needs `@types/node` 22 or newer, so the root pins `@types/node` to the Node 24 runtime.
