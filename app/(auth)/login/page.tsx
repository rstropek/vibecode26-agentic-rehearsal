import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { TextLink } from "@/components/ui/text-link";
import { safeNext, withNext } from "@/lib/safe-next";
import { getUserId } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// `?next=` is where to go after signing in, e.g. back to /device for the CLI login.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getUserId(await headers())) redirect(target);
  return (
    <PageShell
      title="Oh. You're back."
      lede="Sign in and Lissie will dig out your lists. Eventually."
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
