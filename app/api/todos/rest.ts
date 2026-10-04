import "server-only";
import type { ErrorBody, ErrorCode } from "@todo-cat/contract";
import { getUserId } from "@/lib/session";
import { TodoError } from "@/lib/todo-service";

// The REST adapter's shared plumbing: resolve the user, then map the service's typed errors to HTTP.
// See tech-docs/rest-api.md.

const statusByCode: Record<ErrorCode, number> = {
  unauthorized: 401,
  "todo-not-found": 404,
  "validation-failed": 400,
};

function errorResponse(code: ErrorCode, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return Response.json(body, { status: statusByCode[code] });
}

// Runs `handler` for the signed-in user (bearer token or session cookie), or answers 401 before touching the input.
export async function withUser(
  request: Request,
  handler: (userId: string) => Promise<Response>,
): Promise<Response> {
  const userId = await getUserId(request.headers);
  if (!userId) {
    return errorResponse(
      "unauthorized",
      "Send Authorization: Bearer <session token> or a session cookie",
    );
  }
  try {
    return await handler(userId);
  } catch (error) {
    if (error instanceof TodoError) {
      return errorResponse(error.code, error.message);
    }
    throw error;
  }
}

// A body that is not JSON is a `validation-failed` like any other bad input.
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new TodoError("validation-failed", "Request body must be JSON");
  }
}
