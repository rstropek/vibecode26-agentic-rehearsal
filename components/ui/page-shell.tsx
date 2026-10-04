import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/wordmark";

// The page every screen outside the chat sits in: the wordmark, Lissie's line as a big condensed headline, a short
// lede, then the content in a narrow left-aligned column.
export function PageShell({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col px-5 pb-16 sm:px-10 lg:px-14 xl:px-20">
      <header className="py-5">
        <Wordmark />
      </header>
      <main className="flex flex-col gap-10 pt-10 sm:pt-16">
        <div className="flex flex-col gap-5">
          <h1 className="voice max-w-[11ch] text-[clamp(3.5rem,10vw,8.5rem)] text-ink">
            {title}
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted">{lede}</p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
