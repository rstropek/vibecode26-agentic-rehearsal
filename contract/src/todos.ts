import { z } from "zod";

// A due date has no time of day and stays a `yyyy-mm-dd` string everywhere; a JavaScript Date would shift it
// to the previous day west of Greenwich.
export const dueDateSchema = z.iso.date();

export const todoIdSchema = z.uuid();

export const todoSchema = z.object({
  id: todoIdSchema,
  title: z.string(),
  dueDate: dueDateSchema.nullable(),
  done: z.boolean(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Todo = z.infer<typeof todoSchema>;

const titleSchema = z.string().trim().min(1).max(200);

export const createTodoInputSchema = z.object({
  title: titleSchema,
  dueDate: dueDateSchema.nullable().optional(),
});
export type CreateTodoInput = z.infer<typeof createTodoInputSchema>;

// Omitted fields stay unchanged; `dueDate: null` removes the due date.
export const updateTodoInputSchema = z.object({
  title: titleSchema.optional(),
  dueDate: dueDateSchema.nullable().optional(),
  done: z.boolean().optional(),
});
export type UpdateTodoInput = z.infer<typeof updateTodoInputSchema>;

export const todoStatusSchema = z.enum(["open", "done", "all"]);
export type TodoStatus = z.infer<typeof todoStatusSchema>;

// `search` matches a case-insensitive substring of the title; an empty search matches everything.
export const todoFilterSchema = z.object({
  status: todoStatusSchema.default("all"),
  search: z.string().trim().optional(),
});
export type TodoFilter = z.input<typeof todoFilterSchema>;
