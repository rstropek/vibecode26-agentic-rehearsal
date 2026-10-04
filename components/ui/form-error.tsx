// Announces a form-level error; renders nothing when there is none.
export function FormError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  );
}
