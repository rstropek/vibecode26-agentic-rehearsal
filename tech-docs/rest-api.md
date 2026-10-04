# REST API

The REST adapter over the todo service, for non-browser clients such as the CLI.
Schemas are from `@todo-cat/contract`; every error body is `errorBodySchema` (`{ error: { code, message } }`).

## Endpoints

Every endpoint answers 401 `unauthorized` without a valid bearer token or session cookie.

- `GET /api/todos?status=open|done|all&search=text`: query `todoFilterSchema`, 200 `todoListSchema`, 400 `validation-failed`.
- `POST /api/todos`: body `createTodoInputSchema`, 201 `todoSchema`, 400 `validation-failed`.
- `GET /api/todos/:id`: 200 `todoSchema`, 404 `todo-not-found`.
- `PATCH /api/todos/:id`: body `updateTodoInputSchema`, 200 `todoSchema`, 400 `validation-failed`, 404 `todo-not-found`.
- `DELETE /api/todos/:id`: 204 without a body, 404 `todo-not-found`.

## Getting a bearer token with curl

Sign in through Better Auth and take `token` from the JSON response (or the `set-auth-token` header):

```sh
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"demo@todo-cat.dev","password":"cat-person-2026"}' | jq -r .token)
curl -s -H "authorization: Bearer $TOKEN" 'http://localhost:3000/api/todos?status=open'
```

## Design decisions

- New handlers wrap their body in `withUser` from `app/api/todos/rest.ts`, which answers 401 before any input is read (so a bad request without a token is 401, not 400) and maps `TodoError` codes to status codes.
- The handlers only parse with `parseInput`, call the service, and pick the success status; anything that is not a `TodoError` propagates as a 500.
- A body that is not JSON is `validation-failed`; the `content-type` header is not checked.
- The list is a bare array (no envelope), because there is no pagination.

## Tests

- `app/api/todos/route.test.ts` calls the exported handlers on a temp database with tokens from the real `/api/auth/sign-up/email` handler, so the bearer plugin is exercised end to end.

## Gotchas

- Handlers take a plain `Request` rather than `NextRequest`, so tests can construct requests with `new Request(...)` and pass `{ params: Promise.resolve({ id }) }` as the context.
- Session cookies work too, and are `SameSite=Lax`, which keeps cross-site form posts from writing todos.
