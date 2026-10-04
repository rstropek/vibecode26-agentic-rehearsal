import { createLissieHandler } from "@/lib/copilot-runtime";
import { getUserId } from "@/lib/session";

// The CopilotKit runtime for Lissie: every route under /api/copilotkit, for the signed-in user only.
// Only GET and POST are exported because the routes the chat may use need nothing else.
async function handle(request: Request): Promise<Response> {
  const userId = await getUserId(request.headers);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return createLissieHandler(userId)(request);
}

export const GET = handle;
export const POST = handle;
