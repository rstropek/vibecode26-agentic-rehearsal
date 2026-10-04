import "server-only";
import { drizzle } from "drizzle-orm/libsql/node";

// The only place that opens the database: import `db` from here instead of creating another client.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set; copy .env.example to .env");
}

export const db = drizzle({ connection: { url } });
