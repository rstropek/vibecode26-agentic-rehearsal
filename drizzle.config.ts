import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Loads .env the way Next.js does; a DATABASE_URL already set by the caller (e.g. the e2e server) wins.
loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set; copy .env.example to .env");
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url },
});
