# Workspaces

## Layout

- The repo root is the Next.js app itself (`app/`, `next.config.ts`), not a workspace member.
- `contract/` (package `@todo-cat/contract`) holds the zod schemas that define the data exchanged between the web app and its clients; see [architecture.md](architecture.md).
- `cli/` (package `todo-cat-cli`) holds the `todo-cat` CLI, bundled by esbuild into `cli/dist/`; see [cli.md](cli.md).

## Why workspaces

- The web app and the CLI must agree on one data shape, so the schemas live in a single package both import rather than being duplicated or extracted from `app/` later.

## Gotchas

- `contract/` exports its TypeScript source directly (`exports` in its `package.json`), so it has no build step: Next.js transpiles workspace packages without `transpilePackages`, Vitest and tsc resolve it through the npm symlink, and the CLI bundles it.
- Package names differ from folder names: import `@todo-cat/contract`, and target workspaces with `-w contract` or `-w cli`.
- Add a dependency to a workspace with `npm install <pkg> -w <folder>`, not from inside the folder, so the single root `package-lock.json` stays authoritative.
- There is one root `tsconfig.json` (its `**/*.ts` include covers `contract/` and `cli/`) and no per-workspace one, so the `@/` alias also resolves inside workspaces; only use it in the CLI from tests, because the bundle must not pull in app code.
- The root `build` runs every workspace's `build` script.
- One root `biome.json` lints the whole repo, workspaces included.
