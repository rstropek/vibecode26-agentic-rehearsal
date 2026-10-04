import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { send } from "./api";
import { CliError } from "./errors";

// Talks to Better Auth's HTTP API under /api/auth through its own typed client.

// Must match `validateClient` of the deviceAuthorization plugin in lib/auth-config.ts.
const clientId = "todo-cat-cli";
const deviceGrant = "urn:ietf:params:oauth:grant-type:device_code";

export type User = { id: string; name: string; email: string };

export type DeviceCode = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
};

function authClient(server: string) {
  return createAuthClient({
    baseURL: server,
    plugins: [deviceAuthorizationClient()],
    // Reuses the REST client's fetch, so a connection failure is `server-unreachable` here too.
    fetchOptions: {
      customFetchImpl: (input, init) => send(String(input), init ?? {}),
    },
  });
}

type AuthError = {
  status: number;
  error?: string;
  error_description?: string;
  message?: string;
};

function unexpected(what: string, error: AuthError | null): CliError {
  const detail = error
    ? (error.error_description ?? error.message ?? `HTTP ${error.status}`)
    : "empty response";
  return new CliError("unexpected-response", `${what} failed: ${detail}`);
}

function bearer(token: string) {
  return { headers: { authorization: `Bearer ${token}` } };
}

// RFC 8628 device flow: `onCode` shows the code to the human, then this polls until they approve it in the
// browser, and returns the new session token. Never opens a browser itself.
export async function deviceLogin(
  server: string,
  onCode: (code: DeviceCode) => void,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<string> {
  const client = authClient(server);
  const { data, error } = await client.device.code({ client_id: clientId });
  if (!data) throw unexpected("Requesting a device code", error);

  onCode({
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete,
    expiresIn: data.expires_in,
  });

  let interval = data.interval * 1000;
  const deadline = Date.now() + data.expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const result = await client.device.token({
      grant_type: deviceGrant,
      device_code: data.device_code,
      client_id: clientId,
    });
    if (result.data) return result.data.access_token;
    switch (result.error?.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        interval += 5000;
        break;
      case "access_denied":
        throw new CliError("login-denied", "The login request was denied");
      case "expired_token":
        throw new CliError(
          "login-expired",
          "The code expired before it was approved; run `todo-cat login` again",
        );
      default:
        throw unexpected("Polling for the session token", result.error);
    }
  }
  throw new CliError(
    "login-expired",
    "The code expired before it was approved; run `todo-cat login` again",
  );
}

// The signed-in user for a token, or null when the server no longer accepts it.
export async function currentUser(
  server: string,
  token: string,
): Promise<User | null> {
  const { data, error } = await authClient(server).getSession({
    fetchOptions: bearer(token),
  });
  if (error) throw unexpected("Reading the session", error);
  if (!data) return null;
  const { id, name, email } = data.user;
  return { id, name, email };
}

// Ends the session on the server, so the token stops working even if a copy of it survives.
export async function revokeSession(
  server: string,
  token: string,
): Promise<void> {
  const { error } = await authClient(server).signOut({
    fetchOptions: bearer(token),
  });
  if (error) throw unexpected("Revoking the session", error);
}
