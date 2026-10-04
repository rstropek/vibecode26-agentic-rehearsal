// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const migrationsFolder = "db/migrations";
const dir = mkdtempSync(join(tmpdir(), "todo-cat-db-test-"));
const file = join(dir, "test.db");
let db: typeof import("./db").db;

beforeAll(async () => {
  // lib/db.ts reads DATABASE_URL on import, so point it at the temp file first.
  vi.stubEnv("DATABASE_URL", `file:${file}`);
  ({ db } = await import("./db"));
});

afterAll(() => {
  db?.$client.close();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

test("migrates a fresh database file and queries it", async () => {
  await migrate(db, { migrationsFolder });

  expect(existsSync(file)).toBe(true);
  const applied = await db.all(sql`select hash from __drizzle_migrations`);
  expect(applied).toHaveLength(readMigrationFiles({ migrationsFolder }).length);
  expect(await db.get(sql`select 1 as ok`)).toEqual({ ok: 1 });
});
