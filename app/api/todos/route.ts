import { createTodoInputSchema, todoFilterSchema } from "@todo-cat/contract";
import { addTodo, listTodos, parseInput } from "@/lib/todo-service";
import { readJson, withUser } from "./rest";

// GET /api/todos?status=open|done|all&search=text
export function GET(request: Request): Promise<Response> {
  return withUser(request, async (userId) => {
    const { searchParams } = new URL(request.url);
    const filter = parseInput(
      todoFilterSchema,
      Object.fromEntries(searchParams),
    );
    return Response.json(await listTodos(userId, filter));
  });
}

export function POST(request: Request): Promise<Response> {
  return withUser(request, async (userId) => {
    const input = parseInput(createTodoInputSchema, await readJson(request));
    return Response.json(await addTodo(userId, input), { status: 201 });
  });
}
