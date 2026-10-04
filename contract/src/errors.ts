import { z } from "zod";

// Stable codes every adapter reports; clients branch on the code, never on the message.
export const errorCodeSchema = z.enum([
  "unauthorized",
  "todo-not-found",
  "validation-failed",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
