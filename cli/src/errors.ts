import type { ErrorCode } from "@todo-cat/contract";

// Codes the CLI reports besides the API's own; agents branch on the code and exit code, never on the message.
export type CliErrorCode =
  | ErrorCode
  | "usage"
  | "server-unreachable"
  | "unexpected-response"
  | "login-denied"
  | "login-expired"
  | "internal";

// One exit code per error code, listed in `todo-cat --help`.
export const exitCodes: Record<CliErrorCode, number> = {
  internal: 1,
  "unexpected-response": 1,
  usage: 2,
  unauthorized: 3,
  "todo-not-found": 4,
  "validation-failed": 5,
  "server-unreachable": 6,
  "login-denied": 7,
  "login-expired": 7,
};

export const exitCodeHelp = `Exit codes:
  0  success
  1  unexpected error or response (internal, unexpected-response)
  2  invalid command line, e.g. delete without --yes (usage)
  3  not logged in, or the session is no longer valid (unauthorized)
  4  no such todo for this user (todo-not-found)
  5  invalid input, e.g. a blank title or a bad date (validation-failed)
  6  the server cannot be reached (server-unreachable)
  7  login was denied or the code expired (login-denied, login-expired)`;

export class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CliError";
  }

  get exitCode(): number {
    return exitCodes[this.code];
  }
}

// Anything thrown that is not a CliError is a bug or an unexpected failure: `internal`.
export function toCliError(error: unknown): CliError {
  return error instanceof CliError
    ? error
    : new CliError(
        "internal",
        error instanceof Error ? error.message : String(error),
      );
}
