# Testing

## Strategy

- Vitest runs unit and integration tests in jsdom: pure functions, zod schemas, CLI logic, and synchronous React components.
- Playwright runs end-to-end tests in Chromium against a real `next dev` server, and covers everything Vitest cannot render, notably async Server Components, routing, and Server Actions.
- Prefer a Vitest test whenever the code can run outside Next.js, and add an e2e test only for flows a user actually goes through.
- `app/page.test.tsx` and `e2e/smoke.spec.ts` are smoke tests that prove each harness works; replace them once real tests exist.

## Commands

- `npm test` runs Vitest once; `npm run test:watch` runs it in watch mode.
- `npm run test:e2e` runs Playwright; pass a file or `--ui` after `--`, e.g. `npm run test:e2e -- --ui`.
- `npx playwright install chromium` downloads the browser on a fresh machine.

## Conventions

- Vitest picks up `*.test.ts(x)` anywhere in the repo, workspaces included, so colocate tests with the code they cover.
- Playwright specs live in `e2e/` as `*.spec.ts`, and Vitest excludes that folder.
- Query by role or label (`getByRole`, `getByLabel`) in both tools, so the tests double as an accessibility check.

## Design decisions

- One root `vitest.config.mts` covers all workspaces, matching the single root `biome.json` and lockfile.
- Path aliases come from Vite's built-in `resolve.tsconfigPaths`, so the `vite-tsconfig-paths` plugin from the Next.js guide is unnecessary.
- E2E runs against `next dev` instead of a production build because it starts faster and needs no build step.
- `playwright.config.ts` asks the OS for a free port and never reuses an existing server, so e2e never hits whatever is already running on port 3000.

## Gotchas

- Next.js 16 allows only one `next dev` per dist directory and exits if a second one starts, so the e2e server builds into `.next-e2e/` via the `NEXT_DIST_DIR` env var read in `next.config.ts`.
- `next dev` adds the type paths of its dist directory to `tsconfig.json` and reformats the file, which is why the `.next-e2e` includes are committed there.
- Playwright re-evaluates its config in each worker process, so the port is stored in `E2E_PORT` once and inherited; set `E2E_PORT` yourself to pin it.
- Testing Library's automatic cleanup needs Vitest globals, which are off, so `vitest.setup.ts` calls `cleanup()` after each test.
- Vitest cannot render async Server Components; test them through Playwright.
- Vitest 5 needs `@types/node` 22 or newer, so the root pins `@types/node` to the Node 24 runtime.
