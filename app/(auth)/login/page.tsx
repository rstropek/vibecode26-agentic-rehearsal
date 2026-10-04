import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { TextLink } from "@/components/ui/text-link";
import { getUserId } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getUserId(await headers())) redirect("/");
  return (
    <PageShell
      title="Oh. You're back."
      lede="Sign in and Lissie will dig out your lists. Eventually."
    >
      <LoginForm />
      <p className="text-muted">
        New here? <TextLink href="/signup">Create an account</TextLink>
      </p>
    </PageShell>
  );
}
