import type { ReactNode } from "react";

// The single left-aligned column every page sits in: wordmark, Lissie's headline, a short lede, then the content.
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
    <main className="flex w-full max-w-md flex-col gap-8 px-6 py-16 sm:ml-[12vw] sm:py-24">
      <p className="text-lg font-bold tracking-tight text-ink">todo-cat</p>
      <div className="flex flex-col gap-3">
        <h1 className="text-5xl leading-[1.05] font-extrabold tracking-tight text-balance text-ink sm:text-6xl">
          {title}
        </h1>
        <p className="text-lg leading-relaxed text-muted">{lede}</p>
      </div>
      {children}
    </main>
  );
}
