// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CallToolResult,
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  errorBodySchema,
  todoListSchema,
  todoSchema,
  todoTools,
} from "@todo-cat/contract";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// /api/mcp end to end in-process: Better Auth's real OAuth endpoints issue the access tokens through the flow an MCP
// client like Claude Code runs (CIMD client id, PKCE, consent, resource-bound token), and an MCP client on revision
// 2026-07-28 calls the route handler with them. Every HTTP request goes to the route modules, never to the network.

const base = "http://localhost:3000";
const resource = `${base}/api/mcp`;
const redirectUri = "http://127.0.0.1:43123/callback";

// The client's metadata document, as an MCP client hosts it at its client id URL. The real transport fetches it over
// HTTPS; this one serves it from memory (Better Auth's CIMD docs suggest .test origins for exactly this).
const { clientId, clientMetadata } = vi.hoisted(() => {
  const clientId = "https://mcp-client.test/oauth/client-metadata.json";
  return {
    clientId,
    clientMetadata: {
      client_id: clientId,
      client_name: "Test MCP client",
      redirect_uris: ["http://127.0.0.1/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
});
vi.mock("@better-auth/cimd/node", () => ({
  fetchClientMetadataResource: async (input: RequestInfo | URL) =>
    String(input instanceof Request ? input.url : input) === clientId
      ? Response.json(clientMetadata)
      : new Response("Not found", { status: 404 }),
}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-mcp-test-"));
let db: typeof import("@/lib/db").db;
let authRoute: typeof import("../auth/[...all]/route");
let mcpRoute: typeof import("./route");
let protectedResource: typeof import("../../.well-known/oauth-protected-resource/api/mcp/route");
let authServer: typeof import("../../.well-known/oauth-authorization-server/api/auth/route");

// Routes a request to the app's route handlers, like Next.js would.
function app(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/mcp") return mcpRoute.POST(request);
  if (pathname.startsWith("/api/auth/")) {
    return request.method === "GET"
      ? authRoute.GET(request)
      : authRoute.POST(request);
  }
  throw new Error(`No route for ${request.method} ${request.url}`);
}

beforeAll(async () => {
  // lib/db.ts and Better Auth read these on import, so set them before importing the route modules.
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-secret-that-is-at-least-32-characters-long",
  );
  vi.stubEnv("BETTER_AUTH_URL", base);
  // /api/mcp fetches the token signing keys from /api/auth/jwks.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    app(new Request(input, init)),
  );
  ({ db } = await import("@/lib/db"));
  // Before Better Auth is imported: creating `auth` seeds the OAuth resource table.
  await migrate(db, { migrationsFolder: "db/migrations" });
  authRoute = await import("../auth/[...all]/route");
  mcpRoute = await import("./route");
  protectedResource = await import(
    "../../.well-known/oauth-protected-resource/api/mcp/route"
  );
  authServer = await import(
    "../../.well-known/oauth-authorization-server/api/auth/route"
  );
});

afterAll(() => {
  db?.$client.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

// Signs up through the real Better Auth route and returns the session cookie, as a browser would hold it.
async function signUp(name: string): Promise<string> {
  const response = await app(
    new Request(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email: `${name.toLowerCase()}@example.com`,
        password: "correct-horse-battery",
      }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

// The authorization code flow with PKCE, as an MCP client runs it, for the user with this session cookie:
// authorize, consent (what the /consent page sends), then the token request bound to the MCP resource.
async function accessToken(cookie: string): Promise<string> {
  const verifier = base64url(randomBytes(32));
  const authorize = new URL(`${base}/api/auth/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "todos offline_access",
    state: "some-state",
    code_challenge: base64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    resource,
  }).toString();
  const toConsent = await app(
    new Request(authorize, { headers: { cookie }, redirect: "manual" }),
  );
  expect(toConsent.status).toBe(302);
  const consentPage = new URL(toConsent.headers.get("location") ?? "", base);
  expect(consentPage.pathname).toBe("/consent");

  const consent = await app(
    new Request(`${base}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: { cookie, origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        accept: true,
        oauth_query: consentPage.search.slice(1),
      }),
    }),
  );
  expect(consent.status).toBe(200);
  const callback = new URL((await consent.json()).url);
  expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
  expect(callback.searchParams.get("state")).toBe("some-state");

  const token = await app(
    new Request(`${base}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: callback.searchParams.get("code") ?? "",
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource,
      }),
    }),
  );
  expect(token.status).toBe(200);
  const { access_token: accessToken } = await token.json();
  expect(accessToken).toEqual(expect.any(String));
  return accessToken;
}

// An MCP client on the current protocol revision that sends this access token to /api/mcp.
async function connect(token: string): Promise<Client> {
  const client = new Client(
    { name: "todo-cat-test", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      fetch: (input, init) => app(new Request(input, init)),
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

function data(result: CallToolResult): unknown {
  expect(result.isError).toBeFalsy();
  const [content] = result.content;
  return JSON.parse(content.type === "text" ? content.text : "");
}

function errorCode(result: CallToolResult): string {
  expect(result.isError).toBe(true);
  const [content] = result.content;
  return errorBodySchema.parse(
    JSON.parse(content.type === "text" ? content.text : ""),
  ).error.code;
}

function initialize(headers: HeadersInit = {}): Request {
  return new Request(resource, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
}

describe("without a valid access token", () => {
  test("answers 401 with the WWW-Authenticate challenge", async () => {
    const response = await mcpRoute.POST(initialize());

    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(
      `resource_metadata="${base}/.well-known/oauth-protected-resource/api/mcp"`,
    );
    expect(challenge).toContain('scope="todos"');
  });

  test.each([
    ["an invalid token", { authorization: "Bearer not-a-token" }],
  ])("answers 401 for %s", async (_, headers) => {
    expect((await mcpRoute.POST(initialize(headers))).status).toBe(401);
  });

  test("answers 401 for a session token or cookie, which are not access tokens", async () => {
    const cookie = await signUp("Mallory");
    const session = cookie.match(/session_token=([^.;]+)/)?.[1] ?? "";
    expect(session).not.toBe("");

    expect((await mcpRoute.POST(initialize({ cookie }))).status).toBe(401);
    expect(
      (await mcpRoute.POST(initialize({ authorization: `Bearer ${session}` })))
        .status,
    ).toBe(401);
  });

  test("answers 403 for a request from another site's page", async () => {
    const response = await mcpRoute.POST(
      initialize({ origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
  });
});

describe("OAuth discovery", () => {
  test("serves the protected resource metadata", async () => {
    const response = await protectedResource.GET(
      new Request(`${base}/.well-known/oauth-protected-resource/api/mcp`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resource,
      authorization_servers: [`${base}/api/auth`],
      scopes_supported: ["todos"],
    });
  });

  test("serves the authorization server metadata with CIMD and PKCE", async () => {
    const response = await authServer.GET(
      new Request(`${base}/.well-known/oauth-authorization-server/api/auth`),
    );

    expect(response.status).toBe(200);
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: `${base}/api/auth`,
      authorization_endpoint: `${base}/api/auth/oauth2/authorize`,
      token_endpoint: `${base}/api/auth/oauth2/token`,
      client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ["S256"],
    });
    expect(metadata.scopes_supported).toEqual(
      expect.arrayContaining(["todos", "offline_access"]),
    );
    expect(metadata.registration_endpoint).toBeUndefined();
  });
});

test("nobody can register or read OAuth clients over HTTP; they come from metadata documents", async () => {
  const cookie = await signUp("Eve");
  const create = await app(
    new Request(`${base}/api/auth/oauth2/create-client`, {
      method: "POST",
      headers: { cookie, origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude Code",
        redirect_uris: ["https://evil.example/callback"],
      }),
    }),
  );
  expect(create.status).toBe(401);
  const list = await app(
    new Request(`${base}/api/auth/oauth2/get-clients`, { headers: { cookie } }),
  );
  expect(list.status).toBe(401);
});

describe("with access tokens for two users", () => {
  let alice: Client;
  let bob: Client;

  beforeAll(async () => {
    alice = await connect(await accessToken(await signUp("Alice")));
    bob = await connect(await accessToken(await signUp("Bob")));
  });

  afterAll(async () => {
    await alice?.close();
    await bob?.close();
  });

  test("lists the contract's tools with their annotations", async () => {
    const { tools } = await alice.listTools();

    expect(
      tools.map(({ name, title, description, annotations }) => ({
        name,
        title,
        description,
        annotations,
      })),
    ).toEqual(
      Object.values(todoTools).map(
        ({ name, title, description, annotations }) => ({
          name,
          title,
          description,
          annotations,
        }),
      ),
    );
  });

  test("whoami is the token's user", async () => {
    const result = data(
      await alice.callTool({ name: "whoami", arguments: {} }),
    );
    expect(result).toMatchObject({
      server: base,
      user: { name: "Alice", email: "alice@example.com" },
    });
  });

  test("each user sees and changes only their own todos", async () => {
    const mine = todoSchema.parse(
      data(
        await alice.callTool({
          name: "add",
          arguments: { title: "Buy cat food", dueDate: "2026-10-06" },
        }),
      ),
    );
    const theirs = todoSchema.parse(
      data(
        await bob.callTool({ name: "add", arguments: { title: "Bob's nap" } }),
      ),
    );

    const list = async (client: Client) =>
      todoListSchema
        .parse(data(await client.callTool({ name: "list", arguments: {} })))
        .map((todo) => todo.title);
    expect(await list(alice)).toEqual(["Buy cat food"]);
    expect(await list(bob)).toEqual(["Bob's nap"]);

    const done = todoSchema.parse(
      data(await alice.callTool({ name: "done", arguments: { id: mine.id } })),
    );
    expect(done.done).toBe(true);

    // Another user's todo is "not found", for reading, changing, and deleting alike.
    for (const [name, args] of [
      ["show", { id: theirs.id }],
      ["edit", { id: theirs.id, title: "Mine now" }],
      ["done", { id: theirs.id }],
      ["reopen", { id: theirs.id }],
      ["delete", { id: theirs.id }],
    ] as const) {
      expect(errorCode(await alice.callTool({ name, arguments: args }))).toBe(
        "todo-not-found",
      );
    }
    expect(
      todoSchema.parse(
        data(
          await bob.callTool({ name: "show", arguments: { id: theirs.id } }),
        ),
      ),
    ).toEqual(theirs);

    expect(
      data(
        await alice.callTool({ name: "delete", arguments: { id: mine.id } }),
      ),
    ).toEqual({ id: mine.id, deleted: true });
    expect(await list(alice)).toEqual([]);
    expect(await list(bob)).toEqual(["Bob's nap"]);
  });

  test("a bad argument is a tool error before anything changes", async () => {
    const result = await alice.callTool({
      name: "add",
      arguments: { title: "Vet", dueDate: "2026-02-30" },
    });
    expect(result.isError).toBe(true);
    expect(
      todoListSchema.parse(
        data(await alice.callTool({ name: "list", arguments: {} })),
      ),
    ).toEqual([]);
  });
});
