import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth-actions";
import { LissieChat } from "@/app/lissie-chat";
import { TodoList } from "@/app/todo-list";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { user } from "@/db/schema";
import { db } from "@/lib/db";
import { localToday } from "@/lib/due-date";
import { lissieThreadId } from "@/lib/lissie";
import { getUserId } from "@/lib/session";
import { listTodos } from "@/lib/todo-service";

// The chat sits on the paper; the list is the one raised sheet, the full height of the screen on the right from lg,
// below the chat on smaller screens.
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
    <div className="flex min-h-dvh flex-col lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
      <div className="flex flex-col px-5 pb-6 sm:px-10 lg:min-h-0 lg:px-14 xl:px-20">
        <header className="flex w-full max-w-3xl items-center justify-between gap-4 py-5">
          <Wordmark />
          <form action={signOut} className="flex items-center gap-4">
            <p className="hidden text-sm text-muted sm:block">{me.name}</p>
            <Button variant="quiet" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex h-[85dvh] w-full max-w-3xl flex-col gap-5 pt-6 sm:pt-10 lg:h-auto lg:min-h-0 lg:flex-1">
          <div className="flex flex-col gap-3">
            <h1 className="voice text-5xl text-balance text-ink sm:text-6xl xl:text-7xl">
              Hi, {me.name}.
            </h1>
            <p className="max-w-prose text-lg leading-relaxed text-muted">
              Lissie keeps your list. Ask her what comes next, if she&apos;s in
              the mood.
            </p>
          </div>
          <LissieChat threadId={lissieThreadId(userId)} />
        </main>
      </div>
      <TodoList todos={todos} today={localToday()} />
    </div>
  );
}
