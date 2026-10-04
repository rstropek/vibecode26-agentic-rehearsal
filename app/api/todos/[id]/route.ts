import { updateTodoInputSchema } from "@todo-cat/contract";
import {
  deleteTodo,
  getTodo,
  parseInput,
  updateTodo,
} from "@/lib/todo-service";
import { readJson, withUser } from "../rest";

// The id is not validated: an id that is not a UUID matches no todo, so it is a 404 like another user's id.
type Context = RouteContext<"/api/todos/[id]">;

export function GET(request: Request, { params }: Context): Promise<Response> {
  return withUser(request, async (userId) => {
    const { id } = await params;
    return Response.json(await getTodo(userId, id));
  });
}

export function PATCH(
  request: Request,
  { params }: Context,
): Promise<Response> {
  return withUser(request, async (userId) => {
    const { id } = await params;
    const input = parseInput(updateTodoInputSchema, await readJson(request));
    return Response.json(await updateTodo(userId, id, input));
  });
}

export function DELETE(
  request: Request,
  { params }: Context,
): Promise<Response> {
  return withUser(request, async (userId) => {
    const { id } = await params;
    await deleteTodo(userId, id);
    return new Response(null, { status: 204 });
  });
}
