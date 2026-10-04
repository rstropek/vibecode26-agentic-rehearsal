// @vitest-environment node
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { todoListSchema, todoSchema } from "@todo-cat/contract";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql/node";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { authRelations } from "@/db/auth-schema";
import * as schema from "@/db/schema";
import { authConfig } from "@/lib/auth-config";

// Drives the built CLI end to end against a real `next dev` server on a spare port, with a temp database
// and a temp config directory. The device code is approved over HTTP with a session from Better Auth's
// test utils, through the same Better Auth endpoints the /device page calls, so no browser is involved.

const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "todo-cat-cli-test-"));
const configDir = join(dir, "config");
const credentialsFile = join(configDir, "todo-cat", "credentials.json");
const databaseUrl = `file:${join(dir, "test.db")}`;
const secret = "test-secret-that-is-at-least-32-characters-long";
const human = { name: "Lissie's Human", email: "human@example.com" };

let base: string;
let server: ChildProcess | undefined;
let serverLog = "";
let cookie: string;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer().listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No port")),
      );
    });
  });
}

// Waits until the todos route answers at all (401 without a token), which also compiles it.
async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) break;
    try {
      const response = await fetch(`${base}/api/todos`);
      if (response.status === 401) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The server did not start:\n${serverLog}`);
}

beforeAll(async () => {
  execFileSync("npm", ["run", "build", "-w", "cli"], { cwd: root });
  base = `http://localhost:${await freePort()}`;

  // Set up the database and a signed-in user before the server opens the file.
  const db = drizzle({
    connection: { url: databaseUrl },
    relations: authRelations,
  });
  await migrate(db, { migrationsFolder: join(root, "db/migrations") });
  const testAuth = betterAuth({
    ...authConfig,
    secret,
    baseURL: base,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    plugins: [...authConfig.plugins, testUtils()],
  });
  const helpers = (await testAuth.$context).test;
  const user = await helpers.saveUser(helpers.createUser(human));
  cookie =
    (await helpers.getAuthHeaders({ userId: user.id })).get("cookie") ?? "";
  db.$client.close();

  const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--port", new URL(base).port],
    {
      cwd: root,
      // Its own process group, so afterAll can stop next dev and its workers together.
      detached: true,
      env: {
        ...process.env,
        // Vitest sets NODE_ENV=test, which Next.js does not support.
        NODE_ENV: "development",
        NEXT_DIST_DIR: ".next-cli-test",
        NEXT_TELEMETRY_DISABLED: "1",
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_URL: base,
        BETTER_AUTH_SECRET: secret,
      },
    },
  );
  child.stdout?.on("data", (chunk) => {
    serverLog += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    serverLog += chunk;
  });
  server = child;
  await waitForServer(120_000);
}, 180_000);

afterAll(async () => {
  if (server?.pid && server.exitCode === null) {
    const exited = new Promise((resolve) => server?.once("exit", resolve));
    process.kill(-server.pid, "SIGTERM");
    await exited;
  }
  rmSync(dir, { recursive: true, force: true });
});

type Run = { code: number | null; stdout: string; stderr: string };

// Starts the built CLI pointed at the test server and the temp config directory.
function start(args: string[]): { child: ChildProcess; done: Promise<Run> } {
  const child = spawn(
    process.execPath,
    [join(root, "cli/bin/todo-cat.js"), ...args],
    {
      env: { ...process.env, TODO_CAT_URL: base, XDG_CONFIG_HOME: configDir },
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise<Run>((resolve) =>
    child.on("close", (code) => resolve({ code, stdout, stderr })),
  );
  return { child, done };
}

function cli(...args: string[]): Promise<Run> {
  return start(args).done;
}

function json(run: Run): unknown {
  expect(run.stderr).toBe("");
  expect(run.code).toBe(0);
  return JSON.parse(run.stdout);
}

// The CLI's error output has the API's error body shape, with the CLI's own codes (e.g. `usage`) added.
const cliErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

function errorCode(run: Run): string {
  return cliErrorSchema.parse(JSON.parse(run.stderr)).error.code;
}

describe("the todo-cat CLI", { timeout: 60_000 }, () => {
  let token: string;
  let catFoodId: string;

  test("logs in with the device flow once the code is approved", async () => {
    const login = start(["login", "--json"]);
    const firstLine = await new Promise<string>((resolve, reject) => {
      let buffer = "";
      login.child.stdout?.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline >= 0) resolve(buffer.slice(0, newline));
      });
      login.done.then((run) =>
        reject(new Error(`login exited: ${run.stderr}`)),
      );
    });
    const code = JSON.parse(firstLine);
    expect(code).toMatchObject({
      userCode: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
      verificationUri: `${base}/device`,
      expiresIn: expect.any(Number),
    });

    // What the /device page does for a signed-in user: claim the code, then approve it.
    const verify = await fetch(
      `${base}/api/auth/device?user_code=${encodeURIComponent(code.userCode)}`,
      { headers: { cookie } },
    );
    expect(await verify.json()).toMatchObject({ status: "pending" });
    const approve = await fetch(`${base}/api/auth/device/approve`, {
      method: "POST",
      headers: { cookie, origin: base, "content-type": "application/json" },
      body: JSON.stringify({ userCode: code.userCode }),
    });
    expect(approve.status).toBe(200);

    const run = await login.done;
    expect(run.code).toBe(0);
    expect(run.stderr).toBe("");
    const lines = run.stdout.trim().split("\n");
    expect(JSON.parse(lines[lines.length - 1])).toEqual({
      server: base,
      user: { id: expect.any(String), ...human },
    });

    // The token is stored owner-only and never printed.
    expect(statSync(credentialsFile).mode & 0o777).toBe(0o600);
    expect(statSync(join(configDir, "todo-cat")).mode & 0o777).toBe(0o700);
    token = JSON.parse(readFileSync(credentialsFile, "utf8")).servers[base]
      .token;
    expect(token).toEqual(expect.any(String));
    expect(run.stdout).not.toContain(token);
  });

  test("whoami shows the signed-in user", async () => {
    expect(json(await cli("whoami", "--json"))).toEqual({
      server: base,
      user: { id: expect.any(String), ...human },
    });
    const text = await cli("whoami");
    expect(text.stdout).toBe(
      `Logged in to ${base} as ${human.name} <${human.email}>.\n`,
    );
  });

  test("adds todos", async () => {
    const catFood = todoSchema.parse(
      json(
        await cli("add", "Buy", "cat", "food", "--due", "2026-10-06", "--json"),
      ),
    );
    expect(catFood).toMatchObject({
      title: "Buy cat food",
      dueDate: "2026-10-06",
      done: false,
    });
    catFoodId = catFood.id;
    const brush = await cli("add", "Brush Lissie");
    expect(brush.code).toBe(0);
    expect(brush.stdout).toContain("Brush Lissie");

    const invalid = await cli("add", "Nap", "--due", "2026-02-30", "--json");
    expect(invalid.code).toBe(5);
    expect(errorCode(invalid)).toBe("validation-failed");
  });

  test("lists todos as JSON and as text", async () => {
    const todos = todoListSchema.parse(json(await cli("list", "--json")));
    expect(todos.map((todo) => todo.title)).toEqual([
      "Buy cat food",
      "Brush Lissie",
    ]);

    const text = await cli("list", "--search", "lissie");
    expect(text.code).toBe(0);
    expect(text.stdout).toContain("[ ]");
    expect(text.stdout).toContain("Brush Lissie");
    expect(text.stdout).not.toContain("Buy cat food");
  });

  test("marks a todo as done", async () => {
    const done = todoSchema.parse(json(await cli("done", catFoodId, "--json")));
    expect(done.done).toBe(true);
    expect(done.completedAt).toEqual(expect.any(String));

    const doneList = todoListSchema.parse(
      json(await cli("list", "--status", "done", "--json")),
    );
    expect(doneList.map((todo) => todo.id)).toEqual([catFoodId]);
  });

  test("deletes a todo only with --yes", async () => {
    const refused = await cli("delete", catFoodId, "--json");
    expect(refused.code).toBe(2);
    expect(errorCode(refused)).toBe("usage");
    expect(json(await cli("show", catFoodId, "--json"))).toMatchObject({
      id: catFoodId,
    });

    expect(json(await cli("delete", catFoodId, "--yes", "--json"))).toEqual({
      id: catFoodId,
      deleted: true,
    });
    const missing = await cli("show", catFoodId, "--json");
    expect(missing.code).toBe(4);
    expect(errorCode(missing)).toBe("todo-not-found");
  });

  test("logs out, revokes the session, and whoami fails afterwards", async () => {
    expect(json(await cli("logout", "--json"))).toEqual({
      server: base,
      loggedOut: true,
    });
    expect(existsSync(credentialsFile)).toBe(false);

    // The server no longer accepts the old token, so a leaked copy is useless.
    const withOldToken = await fetch(`${base}/api/todos`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(withOldToken.status).toBe(401);

    const whoami = await cli("whoami", "--json");
    expect(whoami.code).toBe(3);
    expect(errorCode(whoami)).toBe("unauthorized");
  });
});
