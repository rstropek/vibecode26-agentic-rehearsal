import type { ComponentProps } from "react";

const variants = {
  primary: "bg-ink text-paper hover:bg-ink/85",
  quiet: "border border-edge text-ink hover:border-ink",
  danger: "bg-danger text-paper hover:bg-danger/90",
};

const sizes = {
  md: "h-11 px-5 text-base",
  // Touch screens get the full 44px height.
  sm: "h-9 px-3.5 text-sm pointer-coarse:h-11",
};

type ButtonProps = Omit<ComponentProps<"button">, "className"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({
  variant = "primary",
  size = "md",
  type = "submit",
  ...button
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`shrink-0 rounded-md font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-amber-strong disabled:cursor-wait disabled:opacity-75 ${sizes[size]} ${variants[variant]}`}
      {...button}
    />
  );
}
