import { expect, test } from "vitest";
import { formatDueDate } from "./due-date";

test("formats a calendar day without shifting it to the previous day", () => {
  expect(formatDueDate("2026-10-05")).toBe("Mon, Oct 5");
  expect(formatDueDate("2026-01-01")).toBe("Thu, Jan 1");
});
