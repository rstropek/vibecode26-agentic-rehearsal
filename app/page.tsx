import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth-actions";
import { LissieChat } from "@/app/lissie-chat";
import { TodoSidebar } from "@/app/todo-sidebar";
import { Button } from "@/components/ui/button";
import { user } from "@/db/schema";
import { db } from "@/lib/db";
import { lissieThreadId } from "@/lib/lissie";
import { getUserId } from "@/lib/session";
import { listTodos } from "@/lib/todo-service";

export default async function Home() {
  const userId = await getUserId(await headers());
  if (!userId) redirect("/login");
  const me = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  if (!me) redirect("/login");
  const todos = await listTodos(userId);

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex items-center justify-between gap-4 px-6 pt-6 sm:pr-[6vw] sm:pl-[12vw]">
        <p className="text-lg font-bold tracking-tight text-ink">todo-cat</p>
        <form action={signOut}>
          <Button variant="quiet">Sign out</Button>
        </form>
      </header>
      <div className="flex flex-1 flex-col gap-10 px-6 pb-6 sm:pr-[6vw] sm:pl-[12vw] lg:min-h-0 lg:flex-row lg:gap-12">
        <main className="flex h-[85dvh] w-full max-w-3xl flex-col gap-6 pt-10 lg:h-auto lg:min-h-0 lg:flex-1">
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
        <TodoSidebar todos={todos} />
      </div>
    </div>
  );
}
