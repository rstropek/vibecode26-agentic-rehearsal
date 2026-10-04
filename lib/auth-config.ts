import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import type { BetterAuthOptions } from "better-auth";
import { bearer, deviceAuthorization, jwt } from "better-auth/plugins";

// Auth options without the database, shared by lib/auth.ts, the auth tests, and the schema generator (db/auth-cli.ts).
// Kept free of `server-only` and lib/db.ts because the Better Auth CLI cannot load modules that import them.

// The MCP server's protected resource identifier: the audience of its access tokens, so it must be the URL that
// clients connect to. Better Auth reads BETTER_AUTH_URL for its own base URL too.
export const mcpResource = new URL(
  "/api/mcp",
  process.env.BETTER_AUTH_URL || "http://localhost:3000",
).href;

// The one scope an MCP access token needs: read and change the user's to-do list.
export const mcpScope = "todos";

// A function, because plugin instances hold state (the OAuth provider's registered extensions) and must not be shared
// between two auth instances, such as the real one and a test's.
export const authConfig = () =>
  ({
    emailAndPassword: { enabled: true },
    // The jwt plugin's /token would mint session JWTs signed with the same keys as the access tokens; nothing uses it.
    disabledPaths: ["/token"],
    plugins: [
      // The REST API and the CLI send `Authorization: Bearer <session token>`.
      bearer(),
      // The CLI logs in like `gh auth login`; only its own client id may start the flow.
      deviceAuthorization({
        verificationUri: "/device",
        validateClient: (clientId) => clientId === "todo-cat-cli",
      }),
      // Signs the MCP access tokens and serves the keys at /api/auth/jwks, where /api/mcp verifies them.
      jwt(),
      // The OAuth 2.1 authorization server for /api/mcp; see tech-docs/mcp.md.
      mcp({
        resource: mcpResource,
        scopes: ["openid", "profile", "email", "offline_access", mcpScope],
        loginPage: "/login",
        consentPage: "/consent",
        // Clients come only from metadata documents (cimd below): nobody may create, read, or change client records
        // through /api/auth/oauth2/*-client, which by default any signed-in user could, e.g. to phish with a fake name.
        clientPrivileges: () => false,
      }),
      // MCP clients such as Claude Code identify themselves by the URL of their metadata document, without registering.
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    ],
  }) satisfies BetterAuthOptions;
