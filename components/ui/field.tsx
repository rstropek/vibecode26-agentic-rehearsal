import type { ComponentProps } from "react";

// The look of every text, email, password, and date input, also where a Field's stacked label does not fit.
export const inputClassName =
  "h-11 min-w-0 rounded-md border border-edge bg-paper-raised px-3 text-base font-normal text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-amber-strong focus-visible:ring-1 focus-visible:ring-amber-strong";

type FieldProps = Omit<ComponentProps<"input">, "className"> & {
  label: string;
  /** A rule the value must follow, such as a minimum length, shown under the input and read with it. */
  hint?: string;
};

// A labelled text input; the wrapping label ties them together for screen readers and getByLabel. The hint sits
// outside the label so it describes the input instead of becoming part of its name.
export function Field({ label, hint, ...input }: FieldProps) {
  const hintId = hint ? `${input.name}-hint` : undefined;
  const field = (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      {label}
      <input className={inputClassName} aria-describedby={hintId} {...input} />
    </label>
  );
  if (!hint) return field;
  return (
    <div className="flex flex-col gap-1.5">
      {field}
      <p id={hintId} className="text-sm text-muted">
        {hint}
      </p>
    </div>
  );
}
