<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# todo-cat

A to-do list web app whose lists are kept by Lissie, a cat with attitude (an AI agent, coming later).
Next.js 16 App Router app at the repo root, plus npm workspaces `contract/` (shared zod schemas) and `cli/` (the todo-cat CLI), both still empty.

## Commands

- `npm install` installs the root app and both workspaces.
- `npm run dev` starts the dev server on http://localhost:3000.
- `npm run build` creates a production build.
- `npm test` runs the Vitest unit and integration tests once.
- `npm run test:e2e` runs the Playwright end-to-end tests in Chromium against its own dev server.
- `npm run lint` runs `biome check` (lint, format, import order).
- `npm run typecheck` generates Next.js route types and type-checks all workspaces.
- `npm run qa` runs every check (Biome, typecheck, build, Vitest, Playwright) and prints only what failed.
- `npx biome check --write` applies Biome's safe fixes and formatting.

## Definition of done

- Run `npm run qa` before you call a task done, and keep going until it passes.
- Fix the code instead of suppressing findings: no `biome-ignore`, `@ts-expect-error`, `any`, skipped tests, or loosened config to get green.

## Newer than your training data

- Next.js 16, React 19.2, Tailwind 4 and Biome 2 have changed since your training data, so verify APIs against current docs instead of memory.
- Next.js docs for the installed version are in `node_modules/next/dist/docs/`.

## Tech docs

`tech-docs/` holds project-specific technical docs, written primarily for agents.

- Describe approach, principles, design decisions with their reasons, and gotchas.
- Point to the central files instead of copying code.
- Leave out anything an agent finds out by reading the code.
- Describe the current state only; delete outdated content instead of adding caveats.

Index:

- [tech-docs/workspaces.md](tech-docs/workspaces.md): workspace layout and why it exists before its content does.
- [tech-docs/testing.md](tech-docs/testing.md): test strategy, QA script, CI, and gotchas for Vitest and Playwright.

## Keeping this map current

- When a change invalidates a line here or in `tech-docs/`, or teaches a costly lesson, update AGENTS.md and the tech docs in the same change.
- Prefer deleting over adding, pointers over prose, one sentence per bullet.
