import "server-only";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// The OAuth provider (the mcp() plugin) sends the browser to /login and /consent with the client's authorization request
// in the query, signed and with an expiry. See tech-docs/mcp.md.

type SearchParams = Record<string, string | string[] | undefined>;

// What the provider adds to sign the query; the rest is the client's own authorization request.
const signatureParams = ["sig", "exp", "ba_iat", "ba_pl", "ba_param"];

export function toQuery(searchParams: SearchParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of [value ?? []].flat()) query.append(key, item);
  }
  return query;
}

// The authorization request from a page's search params, or null unless the provider signed it and it has not expired.
// The signature covers every parameter, so a page must not add its own to this query.
export async function verifiedOAuthQuery(
  searchParams: SearchParams,
): Promise<URLSearchParams | null> {
  if (searchParams.sig === undefined) return null;
  const query = toQuery(searchParams);
  const { secret } = await auth.$context;
  return (await verifyOAuthQueryParams(query.toString(), secret))
    ? query
    : null;
}

// Where /login sends the user once signed in: the authorize endpoint again with the client's original request, which
// now finds a session and continues to the consent page. `prompt=login` is dropped, or it would ask for a login again.
export function authorizeAfterLogin(query: URLSearchParams): string {
  const request = new URLSearchParams(query);
  for (const param of signatureParams) request.delete(param);
  const prompt = (request.get("prompt") ?? "")
    .split(" ")
    .filter((value) => value && value !== "login");
  if (prompt.length > 0) request.set("prompt", prompt.join(" "));
  else request.delete("prompt");
  return `/api/auth/oauth2/authorize?${request}`;
}
