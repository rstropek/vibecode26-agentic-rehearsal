import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { TextLink } from "@/components/ui/text-link";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toQuery, verifiedOAuthQuery } from "@/lib/oauth-query";
import { withNext } from "@/lib/safe-next";
import { getUserId } from "@/lib/session";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Connect an app" };

// Where the OAuth provider asks the signed-in user whether an MCP client, such as Claude Code, may use their list
// through /api/mcp. See tech-docs/mcp.md for the whole flow.

function failed() {
  return (
    <PageShell
      title="That didn't work."
      lede="The request may have expired or been used already. Start connecting again from your app."
    >
      <p>
        <TextLink href="/">Back to your list</TextLink>
      </p>
    </PageShell>
  );
}

// A client id that is a URL (a Client ID Metadata Document) proves the app's site; its name is only what it claims.
function siteOf(clientId: string): string | null {
  return URL.canParse(clientId) ? new URL(clientId).host : null;
}

export default async function ConsentPage({
  searchParams,
}: PageProps<"/consent">) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const userId = await getUserId(requestHeaders);
  if (!userId) {
    redirect(withNext("/login", `/consent?${toQuery(params)}`));
  }
  const oauth = await verifiedOAuthQuery(params);
  const clientId = oauth?.get("client_id");
  if (!oauth || !clientId) return failed();

  let client: Awaited<ReturnType<typeof auth.api.getOAuthClientPublic>>;
  try {
    client = await auth.api.getOAuthClientPublic({
      query: { client_id: clientId },
      headers: requestHeaders,
    });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return failed();
  }
  // Allowing lets the app act as this account, so the page names it.
  const me = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  const name = client.client_name ?? "An app";
  const site = siteOf(clientId);

  return (
    <PageShell
      title={`Let ${name} in?`}
      lede={
        <>
          {name} wants to read and change your list as{" "}
          <span className="font-semibold break-words text-ink">
            {me?.email}
          </span>
          .
        </>
      }
    >
      {site && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted">It comes from</p>
          <p className="text-2xl font-semibold break-words text-ink">{site}</p>
        </div>
      )}
      <p className="leading-relaxed text-ink">
        Allow only if you just connected this app to todo-cat yourself. It can
        add, change, and delete your todos.
      </p>
      <ConsentForm oauthQuery={oauth.toString()} />
    </PageShell>
  );
}
