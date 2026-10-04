// Seeds the database in DATABASE_URL with a demo user and a dozen todos dated relative to today.
// Idempotent: keeps the user if it exists and replaces all of their todos, so every run ends in the same state.
// Runs through tsx with the react-server condition (see package.json) so lib/ modules load outside Next.js.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const demo = {
  name: "Demo Cat Person",
  email: "demo@todo-cat.dev",
  password: "cat-person-2026",
};

// [title, created days ago, due in days (null: no due date), done days ago (null: open)]
const seedTodos: [string, number, number | null, number | null][] = [
  ["Buy the good tuna, not the cheap stuff", 13, null, 12],
  ["Schedule Lissie's vet checkup", 12, 5, null],
  ["Replace the shredded scratching post", 11, null, 9],
  ["File the quarterly tax return", 10, -2, null],
  ["Call the landlord about the dripping tap", 9, null, 6],
  ["Order a new laptop charger", 8, null, null],
  ["Book train tickets to Vienna", 7, 12, null],
  ["Water the plants Lissie hasn't chewed yet", 6, -3, 5],
  ["Renew passport", 5, 30, null],
  ["Clean the window sill, Lissie's lookout", 4, null, 1],
  ["Outline the conference talk", 3, 2, null],
  ["Pick up the dry cleaning", 1, 0, null],
];

function daysFromToday(days: number, hour = 9): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

// Local calendar date as `yyyy-mm-dd`; toISOString would shift it to UTC.
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// lib/db.ts and Better Auth read the environment on import, so load them after loadEnvConfig.
const { eq } = await import("drizzle-orm");
const { user } = await import("@/db/schema");
const { auth } = await import("@/lib/auth");
const { db } = await import("@/lib/db");
const service = await import("@/lib/todo-service");

const existing = await db
  .select({ id: user.id })
  .from(user)
  .where(eq(user.email, demo.email))
  .get();
const userId =
  existing?.id ?? (await auth.api.signUpEmail({ body: demo })).user.id;

for (const todo of await service.listTodos(userId)) {
  await service.deleteTodo(userId, todo.id);
}
for (const [title, createdDaysAgo, dueInDays, doneDaysAgo] of seedTodos) {
  const dueDate = dueInDays === null ? null : isoDate(daysFromToday(dueInDays));
  const { id } = await service.addTodo(
    userId,
    { title, dueDate },
    daysFromToday(-createdDaysAgo),
  );
  if (doneDaysAgo !== null) {
    await service.updateTodo(
      userId,
      id,
      { done: true },
      daysFromToday(-doneDaysAgo, 18),
    );
  }
}

db.$client.close();
console.log(
  `Seeded ${demo.email} (password ${demo.password}) with ${seedTodos.length} todos`,
);
