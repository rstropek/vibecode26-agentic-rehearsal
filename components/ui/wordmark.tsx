import Link from "next/link";

// "todo-cat" in Lissie's condensed voice, at the top of every page; it leads back to the list.
export function Wordmark() {
  return (
    <Link
      href="/"
      className="voice rounded-sm text-[1.75rem] text-ink outline-none focus-visible:ring-3 focus-visible:ring-amber-strong"
    >
      todo-cat
    </Link>
  );
}
