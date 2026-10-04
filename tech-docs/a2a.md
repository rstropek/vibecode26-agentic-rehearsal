# Sindi and A2A

Sindi, the dog next door, is a second Mastra agent in her own app, and Lissie delegates dog errands (fetch the ball, bark at the mailman, guard the porch) to her over the Agent-to-Agent protocol (A2A v0.3).

```
 Lissie (web app) ── tool agent-sindi ──▶ A2AAgent (lib/sindi.ts) ── GET card, POST message/stream ──▶ sindi/ (mastra dev, :4111) ──▶ OpenRouter
```

## Central files

- `sindi/src/mastra/agents/sindi.ts`: the agent `sindi`, her instructions and model.
- `sindi/src/mastra/index.ts`: her Mastra app: the agent, LibSQL storage, and her own observability config.
- `lib/sindi.ts`: the web app's `A2AAgent` for her, registered in `lib/lissie.ts` under `agents`.
- `lib/lissie.ts`: Lissie's persona has exactly one exception to "only your to-do list": dog errands, which she hands to Sindi.

## Sindi's app

- Scaffolded with `create-mastra@1.32.1 --empty`; its own package with its own lockfile in `sindi/`, not an npm workspace, so the web app neither depends on nor bundles her.
- `@mastra/core` is pinned to the web app's version (1.74.0), and the `mastra` CLI and `@mastra/deployer` to the releases made with it; move them together.
- She uses the web app's `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`: her `dev` script runs `mastra dev --env ../.env`.
- Mastra builds the agent card from the agent: `name` is the agent id, `description` is her full instructions, and `skills` lists her tools (none), so her instructions are public and say nothing secret.
- Her traces go to her own storage through `MastraStorageExporter`, visible in Studio at http://localhost:4111; the web app's tracing is configured separately.

## Starting Sindi

- Once per checkout: `npm install --prefix sindi`.
- `npm run dev --prefix sindi` serves her on http://localhost:4111 with Studio; `PORT` picks another port, and then `SINDI_URL` in `.env` must follow.
- The web app finds her at `SINDI_URL` (default http://localhost:4111); restart `npm run dev` after changing it, because `lib/sindi.ts` reads it on import.

## Calling Sindi with curl

The agent card:

```sh
curl -s http://localhost:4111/api/.well-known/sindi/agent-card.json
```

An errand with `message/send`, which answers once with a completed task whose artifact holds her reply:

```sh
curl -s -X POST http://localhost:4111/api/a2a/sindi \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"m-1","parts":[{"kind":"text","text":"Fetch the ball, please."}]}}}' \
  | jq -r '.result.artifacts[0].parts[0].text'
```

The same with `"method":"message/stream"` and `-N -H 'accept: text/event-stream'` streams task updates as server-sent events, which is what Lissie uses.

## Lissie's side

- Mastra turns each entry of `agents` into a tool `agent-<key>`, so Sindi is the tool `agent-sindi`, and the model reads the `description` in `lib/sindi.ts`, not the remote card, which `A2AAgent` fetches only on the first call and then caches for the process.
- Lissie runs streamed, so the delegation uses `message/stream`.
- When Sindi is down or slower than `timeoutMs` (60 s), the delegation fails, the model gets an error tool result, and the persona has Lissie say in character that the dog didn't answer.
- Mastra forwards the parent conversation to a subagent, and `A2AAgent` sends it to Sindi as a `Context:` block in the prompt, so Sindi sees the user's chat, todos included.
- Lissie's memory keeps each delegation in its own thread, with resource `<userId>-sindi`; the chat's replay reads only the user's own thread, so these never show in the chat.
- The chat renders no line for `agent-sindi` calls; Lissie's reply carries the result.

## Tests

- `lib/sindi.test.ts` (Vitest, in QA) runs Lissie with a scripted mock model against a stub A2A server on a free port: `agent-sindi` is offered, an errand reaches the stub as `message/stream` and her reply reaches the model, and an unreachable Sindi gives the model an error result.
- `sindi/test/agent-card.test.ts` (Sindi's own Vitest, in QA) requests her card from the Hono app `mastra dev` serves, in-process, and checks its shape.
- QA and CI install Sindi's dependencies and typecheck and test her, but never start her or call a model.

## Gotchas

- `mastra dev` runs with `sindi/src/mastra/public/` as its working directory, so the relative `file:./sindi.db` lands there (gitignored); `SINDI_DATABASE_URL` overrides it, and her test uses `:memory:`.
- Her `tsconfig.json` sets `"types": ["node"]`, because TypeScript 6 no longer loads `@types/node` on its own.
- The root `tsconfig.json` and `vitest.config.mts` exclude `sindi/`, which has its own; the root Biome config lints her too.
- The A2A routes have no auth in `mastra dev`; anyone who can reach port 4111 can send her errands.
