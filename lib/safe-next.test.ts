import { expect, test } from "vitest";
import { safeNext, withNext } from "./safe-next";

test("keeps a path on this site", () => {
  expect(safeNext("/device?user_code=ABCD")).toBe("/device?user_code=ABCD");
});

test.each([
  ["nothing", undefined],
  ["an empty string", ""],
  ["an absolute URL", "https://evil.example/"],
  ["a protocol-relative URL", "//evil.example/"],
  ["a backslash URL", "/\\evil.example/"],
  ["a relative path", "device"],
])("falls back to / for %s", (_, value) => {
  expect(safeNext(value)).toBe("/");
});

test("withNext adds next only when it is not the default", () => {
  expect(withNext("/login", "/")).toBe("/login");
  expect(withNext("/login", "/device?user_code=AB")).toBe(
    "/login?next=%2Fdevice%3Fuser_code%3DAB",
  );
});
