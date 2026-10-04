import { auth } from "@/lib/auth";

// RFC 9728 protected resource metadata for /api/mcp, at the root and at the resource-path alias below. The mcp()
// plugin answers it from the auth handler, which the /api/auth catch-all route never sees for these paths.
export function GET(request: Request): Promise<Response> {
  return auth.handler(request);
}
