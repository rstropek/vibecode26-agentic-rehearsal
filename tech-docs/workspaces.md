# Workspaces

## Layout

- The repo root is the Next.js app itself (`app/`, `next.config.ts`), not a workspace member.
- `contract/` (package `@todo-cat/contract`) holds the zod schemas that define the data exchanged between the web app and its clients; see [architecture.md](architecture.md).
- `cli/` (package `todo-cat-cli`) will hold the todo-cat CLI.
- Workspaces are declared in the root `package.json`; npm symlinks them into `node_modules/` under their package names.

## Why workspaces

- The web app and the CLI must agree on one data shape, so the schemas live in a single package both import rather than being duplicated or extracted from `app/` later.
- The `cli/` workspace exists before its code so new code lands in the right package from the first commit, and the lockfile and symlinks are already in place.

## Gotchas

- `contract/` exports its TypeScript source directly (`exports` in its `package.json`), so it has no build step.
- Package names differ from folder names: import `@todo-cat/contract`, and target workspaces with `-w contract` or `-w cli`.
- Add a dependency to a workspace with `npm install <pkg> -w <folder>`, not from inside the folder, so the single root `package-lock.json` stays authoritative.
- The root `tsconfig.json` includes `**/*.ts`, so `next build` type-checks `contract/` and `cli/` too.
- One root `biome.json` lints the whole repo, workspaces included.
