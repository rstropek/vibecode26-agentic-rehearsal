// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { type TestHelpers, testUtils } from "better-auth/plugins";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import * as schema from "@/db/schema";
import { authConfig } from "./auth-config";

const dir = mkdtempSync(join(tmpdir(), "todo-cat-auth-test-"));
let db: typeof import("./db").db;
let auth: typeof import("./auth").auth;
let getUserId: typeof import("./session").getUserId;
let helpers: TestHelpers;

beforeAll(async () => {
  // lib/db.ts and Better Auth read these on import, so set them before importing the real modules.
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-secret-that-is-at-least-32-characters-long",
  );
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ db } = await import("./db"));
  // Before Better Auth is imported: creating `auth` seeds the OAuth resource table.
  await migrate(db, { migrationsFolder: "db/migrations" });
  ({ auth } = await import("./auth"));
  ({ getUserId } = await import("./session"));

  // test-utils stays out of the production config: a test-only instance on the same database and secret
  // creates sessions that the real `auth` (and so getUserId) accepts.
  const testAuth = betterAuth({
    ...authConfig(),
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    plugins: [...authConfig().plugins, testUtils()],
  });
  helpers = (await testAuth.$context).test;
});

afterAll(() => {
  db?.$client.close();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("email and password", () => {
  const credentials = {
    email: "lissie@example.com",
    password: "correct-horse-battery",
  };

  test("signs a new user up", async () => {
    const result = await auth.api.signUpEmail({
      body: { name: "Lissie", ...credentials },
    });

    expect(result.user).toMatchObject({
      name: "Lissie",
      email: credentials.email,
    });
    expect(result.token).toBeTruthy();
  });

  test("signs in with the right password", async () => {
    const result = await auth.api.signInEmail({ body: credentials });

    expect(result.user.email).toBe(credentials.email);
    expect(result.token).toBeTruthy();
  });

  test("rejects a wrong password", async () => {
    const attempt = auth.api.signInEmail({
      body: { ...credentials, password: "wrong-password" },
    });

    await expect(attempt).rejects.toBeInstanceOf(APIError);
    await expect(attempt).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("getUserId", () => {
  test("returns the user id for a session cookie", async () => {
    const user = await helpers.saveUser(helpers.createUser());
    const headers = await helpers.getAuthHeaders({ userId: user.id });

    expect(headers.get("cookie")).toBeTruthy();
    expect(await getUserId(headers)).toBe(user.id);
  });

  test("returns the user id for a bearer token", async () => {
    const user = await helpers.saveUser(helpers.createUser());
    const { token } = await helpers.login({ userId: user.id });

    expect(
      await getUserId(new Headers({ authorization: `Bearer ${token}` })),
    ).toBe(user.id);
  });

  test("returns null without a cookie or bearer token", async () => {
    expect(await getUserId(new Headers())).toBeNull();
  });

  test("returns null for an unknown bearer token", async () => {
    expect(
      await getUserId(new Headers({ authorization: "Bearer not-a-session" })),
    ).toBeNull();
  });
});
