# Lissie, the agent

Lissie is one Mastra agent, served to the chat on `/` by an embedded CopilotKit runtime over AG-UI.

```
 app/lissie-chat.tsx ── CopilotKit v2 ──▶ /api/copilotkit/* ── getUserId ──▶ createLissieHandler(userId)
   (CopilotChat, threadId                 (route.ts: 401         │  onBeforeHandler: authorizeRoute
    from the server)                       without session)      ▼
                                          LissieRunner ──▶ MastraAgent (@ag-ui/mastra) ──▶ Agent `lissie`
                                          (in-memory runs,                                  │ model: OpenRouter
                                           replay from memory)                              ▼
                                                                      Mastra Memory ──▶ mastra_* tables in DATABASE_URL
```

## Central files

- `lib/lissie.ts`: the agent, its instructions, memory, `lissieThreadId`, and `loadLissieHistory`.
- `lib/lissie-model.ts`: the model string, its own module so tests can mock it.
- `lib/copilot-runtime.ts`: the runtime, the route guard `authorizeRoute`, and `LissieRunner`.
- `app/api/copilotkit/[[...slug]]/route.ts`: resolves the session and hands the request to the runtime.
- `app/lissie-chat.tsx`: the client chat; `app/page.tsx` passes it the thread id.

## Model

- `openrouter/${OPENROUTER_MODEL}` through Mastra's model router, default `z-ai/glm-5.3-flash`; check other ids with the mastra skill's `provider-registry.mjs --provider openrouter`.
- `OPENROUTER_API_KEY` is read only by the model router on the server: the agent modules import `server-only`, and there is no `NEXT_PUBLIC_` variant.
- OpenRouter is asked to drop reasoning from responses (`reasoning: { exclude: true }`), because CopilotChat renders a reasoning model's thinking, which breaks character and paraphrases the instructions.

## Memory and threads

- One thread per user: thread id `lissie-<userId>`, resource id = the Better Auth user id, both from the server session, never from the browser.
- Mastra stores threads and messages in its own `mastra_*` tables in the same SQLite file as Drizzle, through Drizzle's libSQL client (`db.$client`), so the two never contend for write locks; Mastra creates and migrates those tables itself, outside `db/migrations/`.
- The bridge (`MastraAgent`) sends Mastra only messages it has not stored yet, matched by id, so replayed history must keep Mastra's message ids (`loadLissieHistory` does).
- `lastMessages: 20` bounds the context; the full history stays in storage.

## Runtime and authorization

- Without CopilotKit Intelligence, the runtime authorizes nothing by itself: the default `InMemoryAgentRunner` serves any thread id it is given, `GET /threads` lists every thread in the process, and `POST /threads/clear` wipes them all.
- So memory scoping and runtime access are both authorization here, enforced in two places:
  - `route.ts` answers 401 before the runtime sees a request without a session (cookie or bearer token).
  - `authorizeRoute` runs after routing on every route and denies by default: `info`, plus `agent/run`, `agent/connect`, and `agent/stop` for agent `lissie` on the caller's own thread; everything else is 404.
- Another user's thread is 404, not 403, like a todo; Mastra additionally refuses a thread whose stored resource differs from the run's.
- The runtime is built per request around the resolved user id rather than reading identity from a header or an `identifyUser` callback, so no route can run without a known user.
- The route exports only GET and POST; the runtime's PATCH and DELETE routes are thread mutations the chat never uses.
- The runtime forwards no request headers to the agent (`forwardHeaders` denies `authorization` and `x-*`, everything it would forward): the Mastra bridge passes forwarded headers into the model call, so by default a bearer client's session token went to OpenRouter and replaced the API key.

## Conversations across restarts

- Runs stream through the in-memory runner, whose store is process-wide, so a later request can reconnect to or stop a run in flight.
- `LissieRunner.connect` replays from Mastra memory as one `MESSAGES_SNAPSHOT` whenever no run is active, which covers a restart, eviction from the in-memory store, and a second tab.
- Replay keeps only user and assistant text; when Lissie gets tools, tool calls need mapping here too.

## Frontend

- `CopilotKit` from `@copilotkit/react-core/v2` with `useSingleEndpoint={false}` to match the multi-route handler, and `enableInspector={false}` because the inspector's thread routes are denied.
- `CopilotChat` gets an explicit `threadId`, which makes it connect (replay) on mount instead of minting a fresh thread; it does not run the model until the user sends a message.
- The chat's shadcn tokens are mapped to the app's theme in `app/globals.css` under `.lissie-chat`; CopilotKit's `--muted` is a surface while ours is text, hence the `--color-*` indirection.

## Tests

- `app/api/copilotkit/[[...slug]]/route.test.ts` runs the real route on a temp database with Mastra's mock model (`@mastra/core/test-utils/llm-mock`): 401 on every runtime route, 404 on routes the chat does not use, no run, connect, stop, or thread read on another user's thread, memory scoped to the user, no session token in the model call's headers, and replay after the in-memory store is cleared (a restart).
- `e2e/chat.spec.ts` (in QA) checks that `/` shows the chat and connects without running the model.
- `e2e/chat.model.spec.ts` talks to the real model and checks the reply survives a reload; it runs only with `npm run test:e2e:model`, never in QA or CI.

## Gotchas

- The chat ignores input until its connect request has finished, which takes seconds on a cold `next dev`; e2e tests wait for the send button to be enabled.
- `CopilotChat` without an explicit `threadId` mints a random one on mount, so history would not come back.
- Import runtime and React APIs from the `/v2` subpaths; the package roots are the deprecated v1 surface and fail only at runtime.
- The CopilotKit runtime sends anonymous telemetry unless `COPILOTKIT_TELEMETRY_DISABLED=true`; the tests and the e2e server set it.
