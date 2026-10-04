import "server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@/db/schema";
import { authConfig } from "@/lib/auth-config";
import { db } from "@/lib/db";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
// Sessions are read only through getUserId in lib/session.ts; see tech-docs/auth.md.
export const auth = betterAuth({
  ...authConfig,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  // nextCookies lets Server Actions set the session cookie and must stay last.
  plugins: [...authConfig.plugins, nextCookies()],
});
