import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth-actions";
import { LissieChat } from "@/app/lissie-chat";
import { Button } from "@/components/ui/button";
import { user } from "@/db/schema";
import { db } from "@/lib/db";
import { lissieThreadId } from "@/lib/lissie";
import { getUserId } from "@/lib/session";

export default async function Home() {
  const userId = await getUserId(await headers());
  if (!userId) redirect("/login");
  const me = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  if (!me) redirect("/login");

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 px-6 pt-6 sm:pr-[12vw] sm:pl-[12vw]">
        <p className="text-lg font-bold tracking-tight text-ink">todo-cat</p>
        <form action={signOut}>
          <Button variant="quiet">Sign out</Button>
        </form>
      </header>
      <main className="flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 px-6 pt-10 pb-6 sm:ml-[12vw] sm:px-0">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-balance text-ink sm:text-5xl">
            Hi, {me.name}.
          </h1>
          <p className="text-lg leading-relaxed text-muted">
            Lissie keeps your list. Ask her what comes next, if she&apos;s in
            the mood.
          </p>
        </div>
        <LissieChat threadId={lissieThreadId(userId)} />
      </main>
    </div>
  );
}
