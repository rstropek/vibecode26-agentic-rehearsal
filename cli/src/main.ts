import { run } from "./program";

// Sets the exit code instead of calling process.exit, so buffered stdout is flushed first.
process.exitCode = await run(process.argv);
