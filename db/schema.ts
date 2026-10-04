// Drizzle table definitions; `npm run db:generate` diffs them into db/migrations.
// Better Auth's tables are generated into db/auth-schema.ts by `npm run auth:generate`; don't edit that file by hand.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

// Only lib/todo-service.ts reads or writes this table; see tech-docs/architecture.md.
export const todos = sqliteTable(
  "todos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // `yyyy-mm-dd`, never a timestamp: a due date has no time of day.
    dueDate: text("due_date"),
    done: integer("done", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("todos_user_id_idx").on(table.userId)],
);
