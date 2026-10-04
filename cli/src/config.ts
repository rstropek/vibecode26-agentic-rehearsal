import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CliError } from "./errors";

// Just the variables read here; tests pass a plain object instead of process.env.
type Env = Record<string, string | undefined>;

export const defaultServer = "http://localhost:3000";

// The server's origin from TODO_CAT_URL, so tokens are keyed by a canonical URL.
export function serverUrl(env: Env = process.env): string {
  const value = env.TODO_CAT_URL || defaultServer;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError("usage", `TODO_CAT_URL is not a URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError("usage", `TODO_CAT_URL must be http(s): ${value}`);
  }
  return url.origin;
}

// The user's config directory: XDG_CONFIG_HOME or ~/.config, %APPDATA% on Windows.
export function configDir(env: Env = process.env): string {
  const base =
    env.XDG_CONFIG_HOME ||
    (process.platform === "win32" && env.APPDATA) ||
    join(homedir(), ".config");
  return join(base, "todo-cat");
}

// Session tokens per server origin, so a token is only ever sent to the server that issued it.
type Credentials = { servers: Record<string, { token: string }> };

function credentialsFile(env: Env): string {
  return join(configDir(env), "credentials.json");
}

async function readCredentials(env: Env): Promise<Credentials> {
  let text: string;
  try {
    text = await readFile(credentialsFile(env), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { servers: {} };
    }
    throw error;
  }
  const parsed: Partial<Credentials> = JSON.parse(text);
  return { servers: parsed.servers ?? {} };
}

// Writes owner-only (0600 in a 0700 directory) through a temp file, so a crash never leaves half a file.
async function writeCredentials(
  env: Env,
  credentials: Credentials,
): Promise<void> {
  const dir = configDir(env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const file = credentialsFile(env);
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(temp, 0o600);
  await rename(temp, file);
}

export async function loadToken(
  server: string,
  env: Env = process.env,
): Promise<string | null> {
  return (await readCredentials(env)).servers[server]?.token ?? null;
}

export async function saveToken(
  server: string,
  token: string,
  env: Env = process.env,
): Promise<void> {
  const credentials = await readCredentials(env);
  credentials.servers[server] = { token };
  await writeCredentials(env, credentials);
}

export async function removeToken(
  server: string,
  env: Env = process.env,
): Promise<void> {
  const credentials = await readCredentials(env);
  if (!(server in credentials.servers)) return;
  delete credentials.servers[server];
  if (Object.keys(credentials.servers).length === 0) {
    await rm(credentialsFile(env), { force: true });
  } else {
    await writeCredentials(env, credentials);
  }
}
