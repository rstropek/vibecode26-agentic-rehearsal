import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { TextLink } from "@/components/ui/text-link";
import { safeNext, withNext } from "@/lib/safe-next";
import { getUserId } from "@/lib/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getUserId(await headers())) redirect(target);
  return (
    <PageShell
      title="Fine. I'll keep your lists."
      lede="Lissie has opinions about your to-dos. Create an account and hear them."
    >
      <SignupForm next={target} />
      <p className="text-muted">
        Already have an account?{" "}
        <TextLink href={withNext("/login", target)}>Sign in</TextLink>
      </p>
    </PageShell>
  );
}
