import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/libsql/node";
import { authConfig } from "@/lib/auth-config";

// Entry point for `npm run auth:generate` only: the Better Auth CLI cannot load lib/auth.ts, which imports
// `server-only`. The schema generator needs the relations-v2 adapter but no connection, hence the mock database,
// whose missing tables would otherwise fail the runtime schema check.
export const auth = betterAuth({
  ...authConfig,
  database: drizzleAdapter(drizzle.mock(), { provider: "sqlite" }),
  advanced: { database: { validateSchema: false } },
});
