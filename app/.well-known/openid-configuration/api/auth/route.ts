import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// OpenID discovery for the issuer /api/auth at the path-inserted URL, the next place MCP clients look.
// /api/auth/.well-known/openid-configuration is served by the auth handler itself.
export const GET = oauthProviderOpenIdConfigMetadata(auth);
