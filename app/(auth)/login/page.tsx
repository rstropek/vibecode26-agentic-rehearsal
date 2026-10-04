import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { TextLink } from "@/components/ui/text-link";
import { authorizeAfterLogin, verifiedOAuthQuery } from "@/lib/oauth-query";
import { safeNext, withNext } from "@/lib/safe-next";
import { getUserId } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// `?next=` is where to go after signing in, e.g. back to /device for the CLI login. An MCP client's authorization
// request arrives signed instead (see lib/oauth-query.ts) and continues at the authorize endpoint after signing in.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const oauth = await verifiedOAuthQuery(params);
  const target = oauth ? authorizeAfterLogin(oauth) : safeNext(params.next);
  // The provider sends signed-in users here only when the app asks for a fresh login, so they get the form too.
  if (!oauth && (await getUserId(await headers()))) redirect(target);
  return (
    <PageShell
      title="Oh. You're back."
      lede={
        oauth
          ? "Sign in first. Then you decide whether that app gets your list."
          : "Sign in and Lissie will dig out your list. Eventually."
      }
    >
      <LoginForm next={target} />
      <p className="text-muted">
        New here?{" "}
        <TextLink href={withNext("/signup", target)}>
          Create an account
        </TextLink>
      </p>
    </PageShell>
  );
}
