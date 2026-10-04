import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { PageShell } from "@/components/ui/page-shell";
import { TextLink } from "@/components/ui/text-link";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withNext } from "@/lib/safe-next";
import { getUserId } from "@/lib/session";
import { decideDevice } from "./actions";

export const metadata: Metadata = { title: "Approve the CLI" };

// Where `todo-cat login` sends its human: enter (or confirm) the code, then approve or deny it.
// See tech-docs/cli.md for the whole device flow.

// A command to type in the terminal, set apart from the sentence around it.
function Command({ children }: { children: string }) {
  return <span className="font-semibold text-ink">{children}</span>;
}

const results = {
  approved: {
    title: "Fine. The terminal is in.",
    lede: "Go back to your terminal: todo-cat is logged in as you now.",
  },
  denied: {
    title: "Denied. Good instinct.",
    lede: (
      <>
        That terminal stays out. Run <Command>todo-cat login</Command> again if
        it was you after all.
      </>
    ),
  },
  failed: {
    title: "That didn't work.",
    lede: (
      <>
        The code may have expired or been used already. Run{" "}
        <Command>todo-cat login</Command> again for a new one.
      </>
    ),
  },
};

// Better Auth's default codes are 8 characters; show them as ABCD-EFGH, like the CLI does.
function displayCode(code: string): string {
  return code.replace(/^([A-Z0-9]{4})([A-Z0-9]{4})$/i, "$1-$2").toUpperCase();
}

// Claims the code for the signed-in user (Better Auth's GET /device); only the claiming session may decide it.
async function claimCode(
  userCode: string,
  requestHeaders: Headers,
): Promise<string | null> {
  try {
    const request = await auth.api.deviceVerify({
      query: { user_code: userCode },
      headers: requestHeaders,
    });
    if (request.status !== "pending") {
      return "That code has been used already. Run todo-cat login again for a new one.";
    }
    if (!request.client_id) return "That code belongs to someone else's login.";
    return null;
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return "That code doesn't match a login. Check it against your terminal; it may have expired.";
  }
}

function CodeForm({ code, error }: { code?: string; error?: string }) {
  return (
    <form action="/device" className="flex flex-col gap-5">
      <FormError>{error}</FormError>
      <Field
        label="Code"
        name="user_code"
        placeholder="ABCD-EFGH"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
        defaultValue={code}
      />
      <Button>Continue</Button>
    </form>
  );
}

export default async function DevicePage({
  searchParams,
}: PageProps<"/device">) {
  const { user_code, result } = await searchParams;
  const userCode = typeof user_code === "string" ? user_code.trim() : "";
  const requestHeaders = await headers();
  const userId = await getUserId(requestHeaders);
  if (!userId) {
    redirect(
      withNext(
        "/login",
        userCode
          ? `/device?user_code=${encodeURIComponent(userCode)}`
          : "/device",
      ),
    );
  }

  if (result === "approved" || result === "denied" || result === "failed") {
    return (
      <PageShell {...results[result]}>
        <p>
          <TextLink href="/">Back to your list</TextLink>
        </p>
      </PageShell>
    );
  }

  const error = userCode ? await claimCode(userCode, requestHeaders) : null;
  if (!userCode || error) {
    return (
      <PageShell
        title="Got a code?"
        lede={
          <>
            Enter the code that <Command>todo-cat login</Command> printed in
            your terminal.
          </>
        }
      >
        <CodeForm code={userCode} error={error ?? undefined} />
      </PageShell>
    );
  }

  // Approving lets the terminal act as this account, so the page names it.
  const me = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .get();

  return (
    <PageShell
      title="Let the terminal in?"
      lede={
        <>
          The todo-cat CLI wants to read and change your list as{" "}
          <span className="font-semibold break-words text-ink">
            {me?.email}
          </span>
          .
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted">
          Code from your terminal
        </p>
        <p className="text-5xl font-semibold tracking-[0.12em] text-ink tabular-nums">
          {displayCode(userCode)}
        </p>
      </div>
      <p className="leading-relaxed text-ink">
        Approve only if you just ran <Command>todo-cat login</Command> yourself
        and this is the code it shows.{" "}
        <strong className="font-semibold">
          Never approve a code someone sent you.
        </strong>
      </p>
      <form action={decideDevice} className="flex gap-3">
        <input type="hidden" name="userCode" value={userCode} />
        <Button name="decision" value="approve">
          Approve
        </Button>
        <Button name="decision" value="deny" variant="quiet">
          Deny
        </Button>
      </form>
    </PageShell>
  );
}
