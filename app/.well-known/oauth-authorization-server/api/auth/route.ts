import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// RFC 8414 metadata for the issuer http(s)://<host>/api/auth, where MCP clients look first for an issuer with a path.
export const GET = oauthProviderAuthServerMetadata(auth);
