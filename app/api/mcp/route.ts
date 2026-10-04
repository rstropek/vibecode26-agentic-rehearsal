import { requireMcpAuth } from "@better-auth/mcp";
import {
  createMcpHandler,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { auth } from "@/lib/auth";
import { mcpResource, mcpScope } from "@/lib/auth-config";
import { buildMcpServer } from "@/lib/mcp-server";

// POST /api/mcp: the remote MCP server (Streamable HTTP, revision 2026-07-28 only, stateless), with the same tools as
// `todo-cat mcp --stdio`. Only POST is exported, so GET and DELETE answer 405. See tech-docs/mcp.md.

// One fresh server per request, for the user the access token was issued to.
const mcp = createMcpHandler(
  ({ authInfo }) => {
    const userId = authInfo?.extra?.userId;
    if (typeof userId !== "string") {
      throw new Error("/api/mcp served a request without a verified user");
    }
    return buildMcpServer(userId);
  },
  { legacy: "reject" },
);

// Answers 401 with the RFC 9728 challenge without a valid access token for this resource, and 403 without the scope.
// The user id is the token's verified `sub`, never anything else in the request: no cookie, header, or argument.
const authorized = requireMcpAuth(
  auth,
  (request, claims) => {
    const scopes = typeof claims.scope === "string" ? claims.scope : "";
    return mcp.fetch(request, {
      authInfo: {
        token: request.headers.get("authorization") ?? "",
        clientId: typeof claims.azp === "string" ? claims.azp : "",
        scopes: scopes.split(" ").filter(Boolean),
        expiresAt: claims.exp,
        resource: new URL(mcpResource),
        extra: { userId: claims.sub },
      },
    });
  },
  { resource: mcpResource, requiredScopes: [mcpScope] },
);

// Browsers send an Origin; a page on another site must not reach the server through a user's browser.
const allowedOrigins = [new URL(mcpResource).hostname];

export async function POST(request: Request): Promise<Response> {
  return (
    originValidationResponse(request, allowedOrigins) ?? authorized(request)
  );
}
