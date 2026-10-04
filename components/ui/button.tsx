import type { ComponentProps } from "react";

const variants = {
  primary: "bg-ink text-paper hover:bg-ink/85",
  quiet: "border border-line text-ink hover:border-ink",
};

type ButtonProps = Omit<ComponentProps<"button">, "className"> & {
  variant?: keyof typeof variants;
};

export function Button({
  variant = "primary",
  type = "submit",
  ...button
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`h-11 rounded-md px-5 text-base font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-amber disabled:cursor-wait disabled:opacity-60 ${variants[variant]}`}
      {...button}
    />
  );
}
