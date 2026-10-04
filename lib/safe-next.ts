// Where to go after signing in: only a path on this site, so `?next=` cannot send users to another origin.
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  // `//host` and `/\host` are protocol-relative URLs to another site.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

// Links `path` with `?next=` unless the target is the default.
export function withNext(path: string, next: string): string {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
}
