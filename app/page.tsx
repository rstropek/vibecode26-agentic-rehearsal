import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { user } from "@/db/schema";
import { db } from "@/lib/db";
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
    <PageShell
      title={`Hi, ${me.name}.`}
      lede="Lissie is still sharpening her claws on your lists. Check back soon."
    >
      <form action={signOut}>
        <Button variant="quiet">Sign out</Button>
      </form>
    </PageShell>
  );
}
