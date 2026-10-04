import type { BetterAuthOptions } from "better-auth";
import { bearer, deviceAuthorization } from "better-auth/plugins";

// Auth options without the database, shared by lib/auth.ts, the auth tests, and the schema generator (db/auth-cli.ts).
// Kept free of `server-only` and lib/db.ts because the Better Auth CLI cannot load modules that import them.
export const authConfig = {
  emailAndPassword: { enabled: true },
  plugins: [
    // The REST API and the CLI send `Authorization: Bearer <session token>`.
    bearer(),
    // The CLI logs in like `gh auth login`; only its own client id may start the flow.
    deviceAuthorization({
      verificationUri: "/device",
      validateClient: (clientId) => clientId === "todo-cat-cli",
    }),
  ],
} satisfies BetterAuthOptions;
