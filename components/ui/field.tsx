import type { ComponentProps } from "react";

type FieldProps = Omit<ComponentProps<"input">, "className"> & {
  label: string;
};

// A labelled text input; the wrapping label ties them together for screen readers and getByLabel.
export function Field({ label, ...input }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      {label}
      <input
        className="h-11 rounded-md border border-line bg-paper-raised px-3 text-base font-normal text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-amber focus-visible:ring-3 focus-visible:ring-amber/40"
        {...input}
      />
    </label>
  );
}
