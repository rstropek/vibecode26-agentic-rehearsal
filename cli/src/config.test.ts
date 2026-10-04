// @vitest-environment node
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  configDir,
  loadToken,
  removeToken,
  saveToken,
  serverUrl,
} from "./config";
import { CliError } from "./errors";

const dir = mkdtempSync(join(tmpdir(), "todo-cat-config-test-"));
const env = { XDG_CONFIG_HOME: dir };

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("serverUrl", () => {
  test("defaults to localhost:3000 and keeps only the origin", () => {
    expect(serverUrl({})).toBe("http://localhost:3000");
    expect(serverUrl({ TODO_CAT_URL: "https://todo.example.com/x/" })).toBe(
      "https://todo.example.com",
    );
  });

  test.each([
    "not a url",
    "ftp://todo.example.com",
  ])("rejects %s as a usage error", (value) => {
    expect(() => serverUrl({ TODO_CAT_URL: value })).toThrow(CliError);
  });
});

describe("tokens", () => {
  test("are stored owner-only and only for the server that issued them", async () => {
    await saveToken("http://localhost:3000", "local-token", env);
    await saveToken("https://todo.example.com", "remote-token", env);

    expect(await loadToken("http://localhost:3000", env)).toBe("local-token");
    expect(await loadToken("https://todo.example.com", env)).toBe(
      "remote-token",
    );
    expect(await loadToken("http://localhost:4000", env)).toBeNull();
    const file = join(configDir(env), "credentials.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(configDir(env)).mode & 0o777).toBe(0o700);

    await removeToken("http://localhost:3000", env);
    expect(await loadToken("http://localhost:3000", env)).toBeNull();
    expect(await loadToken("https://todo.example.com", env)).toBe(
      "remote-token",
    );
  });
});
