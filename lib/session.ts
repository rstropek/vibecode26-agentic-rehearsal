import "server-only";
import { auth } from "@/lib/auth";

// The only place that reads sessions. Every adapter (pages, REST, agent tools, MCP) maps a request to a user here.
// Accepts the session cookie or `Authorization: Bearer <session token>`; returns null when neither is valid.
export async function getUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}
