# Lissie, the agent

Lissie is one Mastra agent, served to the chat on `/` by an embedded CopilotKit runtime over AG-UI.

```
 app/lissie-chat.tsx ── CopilotKit v2 ──▶ /api/copilotkit/* ── getUserId ──▶ createLissieHandler(userId)
   (CopilotChat, threadId                 (route.ts: 401         │  onBeforeHandler: authorizeRoute
    from the server)                       without session)      ▼
                                          LissieRunner ──▶ MastraAgent (@ag-ui/mastra) ──▶ Agent `lissie` ──▶ tools ──▶ todo service
                                          (in-memory runs,  requestContext:                 │ model: OpenRouter
                                           replay from memory)  user id, thread             ▼
                                                                      Mastra Memory ──▶ mastra_* tables in DATABASE_URL
```

## Central files

- `lib/lissie.ts`: the agent, its instructions, memory, `lissieThreadId`, `lissieRequestContext`, and `loadLissieHistory`.
- `lib/lissie-tools.ts`: the tools `listTodos`, `addTodo`, `setTodoDone`, and `showProgress`, and `userIdFrom`.
- `lib/lissie-cards.ts`: the progress card's A2UI tree, `lissieCard`, which turns a tool result into its card, and the `LissieCards` middleware that paints cards live.
- `lib/lissie-tool-schemas.ts`: tool names, input and output schemas, and the A2UI catalog id, free of server imports so the browser can use them.
- `lib/lissie-model.ts`: the model string, its own module so tests can mock it.
- `lib/mastra.ts`: the Mastra instance Lissie is registered in for tracing, and `lissieAgent`, the registered agent the runtime serves; see [observability.md](observability.md).
- `lib/sindi.ts`: Sindi, the dog next door, as an A2A subagent; see [a2a.md](a2a.md).
- `lib/copilot-runtime.ts`: the runtime, the route guard `authorizeRoute`, and `LissieRunner`.
- `app/api/copilotkit/[[...slug]]/route.ts`: resolves the session and hands the request to the runtime.
- `app/lissie-chat.tsx`: the client chat; `app/page.tsx` passes it the thread id and renders the list next to it.
- `app/lissie-tool-calls.tsx`: one line per tool call in the chat, and the refresh of the list when a tool changes it.
- `app/lissie-catalog.tsx`: the A2UI catalog the chat renders surfaces with, the basic components plus `ProgressBar`.
- `app/todo-list.tsx`: the list next to the chat, fed by `listTodos` in `app/page.tsx`; see [ui.md](ui.md).

## Model

- `openrouter/${OPENROUTER_MODEL}` through Mastra's model router, default `z-ai/glm-5.3-flash`; check other ids with the mastra skill's `provider-registry.mjs --provider openrouter`.
- `OPENROUTER_API_KEY` is read only by the model router on the server: the agent modules import `server-only`, and there is no `NEXT_PUBLIC_` variant.
- OpenRouter is asked to drop reasoning from responses (`reasoning: { exclude: true }`), because CopilotChat renders a reasoning model's thinking, which breaks character and paraphrases the instructions.

## Memory and threads

- One thread per user: thread id `lissie-<userId>`, resource id = the Better Auth user id, both from the server session, never from the browser.
- Mastra stores threads and messages in its own `mastra_*` tables in the same SQLite file as Drizzle, through Drizzle's libSQL client (`db.$client`), so the two never contend for write locks; Mastra creates and migrates those tables itself, outside `db/migrations/`.
- The bridge (`MastraAgent`) sends Mastra only messages it has not stored yet, matched by id, so replayed history must keep Mastra's message ids (`loadLissieHistory` does).
- `lastMessages: 20` bounds the context; the full history stays in storage.

## Tools

- One more adapter on the todo service ([architecture.md](architecture.md)): `listTodos` (status and search filter), `addTodo` (title, optional due date), `setTodoDone` (id, done or reopened), and `showProgress` (no input; the counts for the progress card below); no edit or delete yet.
- No tool input names a user. `createLissieHandler` gives the bridge `lissieRequestContext(userId)`, which sets Mastra's reserved `MASTRA_RESOURCE_ID_KEY` and `MASTRA_THREAD_ID_KEY` from the session; Mastra lets these override any resource or thread a request names, and `userIdFrom` reads the user from there and throws without one.
- The bridge writes the client's AG-UI `context` into the same request context, but only under its own `ag-ui` key, so the browser cannot set the user.
- `setTodoDone` on an unknown or foreign id returns the contract's error body (`todo-not-found`), which the model reads and answers in character.
- The instructions end with today's date on the server, so the model can turn "Friday" into a due date; the server's time zone stands in for the user's.
- Persona rules in the instructions: Lissie comments in character on every todo she adds or marks done, and feeding the cat gets the strongest opinions.
- Her one subagent is Sindi (`agents: { sindi }`), offered to the model as the tool `agent-sindi`; dog errands are the only exception to "only your to-do list", and a failed delegation means the dog didn't answer; see [a2a.md](a2a.md).

## The progress card (A2UI)

- `showProgress` returns only `{ total, done, open }`, counted in the database by the todo service, so the model never produces the numbers, no second model call builds the card, and neither the model's context nor memory carries a component tree.
- `lissieCard` builds the card from a tool's name and result: A2UI v0.9 operations (`createSurface`, `updateComponents`, `updateDataModel`) in an `a2ui-surface` activity, id `a2ui-surface-<toolCallId>`, which the chat renders with `app/lissie-catalog.tsx`; this is a fixed-schema surface, not generative UI.
- The card's component tree holds no numbers: its components bind to `/total`, `/done`, and `/open` in the data model, which the result fills; a `formatString` call writes "N still open".
- Live, `LissieCards` emits the activity right after the tool result; `LissieRunner.run` attaches it to the runtime's per-request clone of the agent, because `MastraAgent.clone()` drops middleware.
- The runtime's own A2UI middleware is off (`a2ui: { enabled: false }`): it names a surface after the last tool call started rather than the one that returned it, so with parallel calls replay could not reproduce the id, and it would inject `render_a2ui` because the chat has a catalog.
- The `MastraAgent` also gets `a2ui: { injectA2UITool: false }`, or a request's `forwardedProps.injectA2UITool` would add `generate_a2ui`.
- The chat sets `includeSchema: false`, so the catalog's schema never reaches the model's context.
- `createSurface` names `LISSIE_CATALOG_ID` from `lib/lissie-tool-schemas.ts`, the catalog's id in the browser; A2UI refuses a surface whose catalog id is not registered.
- To add a card: give the tool a data-only result, add its builder to `cards` in `lib/lissie-cards.ts`, and add a component to the catalog only when the basic ones cannot express it.

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
- Replay rebuilds the messages the live stream produced, with the same ids: Mastra stores a turn as one assistant message, and the bridge streams its tool calls on that message, each result as a tool message, and text after a tool call as a continuation message `<id>-agui-text` (`-agui-text-2`, …).
- Those continuation ids are the bridge's convention, which it recognizes as already stored when the client sends history back; if a bridge update changes them, the route test that compares live and replayed ids fails.
- Replay skips tool calls without a result (a stopped run), which the chat would show as running forever.
- Activity messages are not stored, so replay rebuilds a card from the stored tool result with `lissieCard`, the function that painted it live, right after the result and with the same id; the bridge ignores activity messages the client sends back.

## Frontend

- `CopilotKit` from `@copilotkit/react-core/v2` with `useSingleEndpoint={false}` to match the multi-route handler, and `enableInspector={false}` because the inspector's thread routes are denied.
- `CopilotChat` gets an explicit `threadId`, which makes it connect (replay) on mount instead of minting a fresh thread; it does not run the model until the user sends a message.
- Tool calls render through `useRenderTool`, one per tool, as one line each ("Added “buy milk”, due Fri, Oct 9"), parsed from the tool result with the shared schemas; anything unparsable shows as a failed call.
- `showProgress`'s line shows only the call running or failing; once it succeeds, the card is the answer, an A2UI surface rendered with the catalog passed to `CopilotKit` as `a2ui={{ catalog }}`.
- The list next to the chat gets its todos from the page; a subscription on the shared `lissie` agent calls `router.refresh()` when an `addTodo` or `setTodoDone` result arrives, while a replay (one `MESSAGES_SNAPSHOT`) refreshes nothing.
- Below `lg` the page scrolls, the chat keeps most of the screen, and the list follows it; from `lg` the list sits next to the chat.
- Styling the chat has its own gotchas (token mapping, hard-coded greys, `text-muted`); see [ui.md](ui.md).

## Tests

- `lib/lissie-tools.test.ts` runs the tool executors on a temp database with the request context the runtime builds: per-user isolation, a user id in the input ignored, not found for another user's todo, no tool runs without a user, and `showProgress` counting only the user's rows.
- `lib/lissie-cards.test.ts` checks the progress card's operations against A2UI's message schema and the catalog, with no numbers in the tree and the result's numbers in the data model, and runs `LissieCards` over parallel tool calls, where each card must follow its result under its own call's id.
- `lib/sindi.test.ts` runs Lissie's delegation to Sindi against a stub A2A server; see [a2a.md](a2a.md).
- `app/lissie-catalog.test.tsx` renders `ProgressBar` alone and through A2UI's own provider with the catalog, which proves its bound props resolve.
- `app/lissie-tool-calls.test.tsx` checks `showProgress`'s line: running, nothing once counted, and failed.
- `app/api/copilotkit/[[...slug]]/route.test.ts` runs the real route on a temp database with a scripted Mastra mock model (`MastraLanguageModelV2Mock`, which answers "Add <title>" with an `addTodo` call and "How am I doing?" with `showProgress` and `listTodos` in one step): 401 on every runtime route, 404 on routes the chat does not use, no run, connect, stop, or thread read on another user's thread, memory scoped to the user, no session token in the model call's headers, replay after the in-memory store is cleared (a restart), the tool acting for the session's user, replayed tool calls matching the live ids, no duplicate messages when replayed history is sent back, no UI-generating tool offered to the model even when a request asks for one, and the progress surface live and replayed under `showProgress`'s own call id.
- `e2e/chat.spec.ts` (in QA) checks that `/` shows the chat and connects without running the model.
- `e2e/todos.spec.ts` (in QA) checks the list next to the chat: todos created through the REST API show up, and adding, checking off, reopening, and deleting with confirmation work in the browser.
- `e2e/chat.model.spec.ts` talks to the real model and checks the reply survives a reload, and `e2e/todos.model.spec.ts` asks Lissie to add "buy milk" and finds it in the list and her tool call after a reload; they run only with `npm run test:e2e:model` (the latter also alone with `npm run test:e2e:model:todos`), never in QA or CI.

## Gotchas

- The chat ignores input until its connect request has finished, which takes seconds on a cold `next dev`; e2e tests wait for the send button to be enabled.
- `CopilotChat` without an explicit `threadId` mints a random one on mount, so history would not come back.
- Import runtime and React APIs from the `/v2` subpaths; the package roots are the deprecated v1 surface and fail only at runtime.
- The CopilotKit runtime sends anonymous telemetry unless `COPILOTKIT_TELEMETRY_DISABLED=true`; the tests and the e2e server set it.
- A2UI's binder resolves a prop from the data model only if its schema is a Zod 3 union with a `{ path }` member, read through Zod 3 internals; a Zod 4 schema (the app's `zod`) passes the raw `{ path }` object to the renderer, so catalog props use A2UI's `Dynamic*Schema` exports.
- `createCatalog` from `@copilotkit/a2ui-renderer` types its definitions against the renderer's private Zod 3 copy, which no app import matches, so `app/lissie-catalog.tsx` builds the `Catalog` from `createReactComponent` and the basic catalog, as `createCatalog` does inside.
- `@copilotkit/a2ui-renderer` and `@a2ui/web_core` are pinned to the versions `@copilotkit/react-core` uses (1.77.0 and 0.10.4); move them together with `@copilotkit/*`.
