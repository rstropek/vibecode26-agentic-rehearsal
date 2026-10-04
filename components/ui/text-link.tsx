import Link from "next/link";
import type { ComponentProps } from "react";

export function TextLink(
  props: Omit<ComponentProps<typeof Link>, "className">,
) {
  return (
    <Link
      className="font-semibold text-ink underline decoration-amber decoration-2 underline-offset-4 outline-none hover:decoration-ink focus-visible:ring-3 focus-visible:ring-amber-strong"
      {...props}
    />
  );
}
