// Deletes the local SQLite file DATABASE_URL points to; `npm run db:reset` then migrates a fresh one.
import { rmSync } from "node:fs";
import nextEnv from "@next/env";

// @next/env is CommonJS, so plain Node only exposes it as a default export.
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) {
  console.error(
    "db:reset only deletes local databases; DATABASE_URL must start with file:",
  );
  process.exit(1);
}

const path = url.slice("file:".length);
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  rmSync(`${path}${suffix}`, { force: true });
}
console.log(`Deleted ${path}`);
