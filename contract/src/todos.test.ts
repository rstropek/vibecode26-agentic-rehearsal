import { describe, expect, test } from "vitest";
import {
  createTodoInputSchema,
  todoFilterSchema,
  todoSchema,
  updateTodoInputSchema,
} from "./todos";

describe("createTodoInputSchema", () => {
  test("trims the title and accepts a due date", () => {
    expect(
      createTodoInputSchema.parse({
        title: "  Feed Lissie ",
        dueDate: "2026-10-05",
      }),
    ).toEqual({ title: "Feed Lissie", dueDate: "2026-10-05" });
  });

  test.each([
    ["an empty title", { title: "" }],
    ["a blank title", { title: "   " }],
    ["a title over 200 characters", { title: "x".repeat(201) }],
    ["a missing title", {}],
    ["a due date with a time", { title: "x", dueDate: "2026-10-05T10:00:00Z" }],
    ["an impossible due date", { title: "x", dueDate: "2026-02-30" }],
  ])("rejects %s", (_, input) => {
    expect(createTodoInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("updateTodoInputSchema", () => {
  test("accepts a partial update and null to clear the due date", () => {
    expect(updateTodoInputSchema.parse({ done: true, dueDate: null })).toEqual({
      done: true,
      dueDate: null,
    });
    expect(updateTodoInputSchema.parse({})).toEqual({});
  });

  test("rejects a blank title", () => {
    expect(updateTodoInputSchema.safeParse({ title: " " }).success).toBe(false);
  });
});

describe("todoFilterSchema", () => {
  test("defaults to all todos", () => {
    expect(todoFilterSchema.parse({})).toEqual({ status: "all" });
  });

  test("rejects an unknown status", () => {
    expect(todoFilterSchema.safeParse({ status: "later" }).success).toBe(false);
  });
});

describe("todoSchema", () => {
  test("accepts a todo as the service returns it", () => {
    const todo = {
      id: crypto.randomUUID(),
      title: "Feed Lissie",
      dueDate: null,
      done: true,
      createdAt: "2026-10-01T09:00:00.000Z",
      completedAt: "2026-10-02T09:00:00.000Z",
    };

    expect(todoSchema.parse(todo)).toEqual(todo);
  });
});
