import { expect, test } from "vitest";
import { formatDueDate, localToday } from "./due-date";

test("formats a calendar day without shifting it to the previous day", () => {
  expect(formatDueDate("2026-10-05")).toBe("Mon, Oct 5");
  expect(formatDueDate("2026-01-01")).toBe("Thu, Jan 1");
});

test("today is the local calendar day", () => {
  expect(localToday(new Date(2026, 9, 4, 23, 59))).toBe("2026-10-04");
  expect(localToday(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
});
