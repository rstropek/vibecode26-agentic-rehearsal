# MCP

todo-cat serves its list as MCP tools in two places, with the same tools:

- **stdio**, `todo-cat mcp --stdio` (`cli/src/mcp.ts`): inside the CLI, so a REST client of `/api/todos`; see [cli.md](cli.md).
- **Streamable HTTP**, `POST /api/mcp` (`app/api/mcp/route.ts`, `lib/mcp-server.ts`): inside the app, an adapter that calls the todo service directly, like the REST routes.

## How they differ

| | stdio | HTTP |
| --- | --- | --- |
| Runs | on the user's machine, spawned by the host | in the app, for every user |
| Signs in with | `todo-cat login` (device flow, session token on disk) | OAuth in the browser, Better Auth as authorization server |
| Reaches the list | through `/api/todos` | through `lib/todo-service.ts` |
| Not signed in | tool error `unauthorized` | HTTP 401 with the `WWW-Authenticate` challenge, before any MCP message |
| Errors besides the service's | CLI codes such as `server-unreachable` | none; anything else propagates as the SDK's tool error |
| Protocol | 2026-07-28; `serveStdio` also answers 2025 clients | 2026-07-28 only (`legacy: "reject"`), stateless |

Results are identical: the tool's JSON (what the CLI prints with `--json`) as one text block, and a failure is `isError: true` with the contract's error body `{ error: { code, message } }`.

## One set of tools

- `contract/src/tools.ts` (`todoTools`) holds every tool's name, title, description, annotations, and input schema, plus the shared part of the server instructions; neither server declares a tool of its own.
- Each server maps every `TodoToolName` to its implementation in a `Record`, so a tool added to the contract does not compile until both servers implement it.
- The CLI's commands are the same entries with a command line on top (`cli/src/commands.ts`), and `--yes` comes from `destructiveHint`.
- Both servers parse the arguments again with the contract schema after the SDK's check, so a bad input is `validation-failed` like everywhere else.

## The HTTP server

- `requireMcpAuth` from `@better-auth/mcp` wraps the route: it verifies the JWT access token against `/api/auth/jwks` (signature, issuer, audience = the resource, expiry) and answers 401 with an RFC 9728 challenge, or 403 without the `todos` scope.
- The user id is the token's `sub` and nothing else: cookies, session tokens, and arguments are never read, so a session token or cookie sent to `/api/mcp` is a 401.
- The verified claims go to the SDK as `authInfo`, and `createMcpHandler` builds a fresh server per request for `authInfo.extra.userId`; another user's todo is `todo-not-found`, from the service.
- Only `POST` is exported, so `GET` and `DELETE` answer 405; a request whose `Origin` is not the app's host is a 403 (`originValidationResponse`), against DNS rebinding through a browser.

## OAuth

- `lib/auth-config.ts` adds `jwt()` (signing keys), `mcp()` (the OAuth 2.1 provider, from `@better-auth/oauth-provider`), and `cimd()`; all Better Auth packages are pinned to the same exact version.
- The protected resource is `${BETTER_AUTH_URL}/api/mcp` (`mcpResource`), and access tokens are audience-bound to it.
- Scopes: `todos` is the one the route requires and the challenge and protected resource metadata advertise; `offline_access` appears only in the authorization server metadata, from where clients add it to get a refresh token.
- Clients are Client ID Metadata Documents: the client id is the URL of the client's JSON document, which Better Auth fetches through `@better-auth/cimd/node` and stores, so Claude Code or MCPJam need no registration.
- `clientPrivileges: () => false` closes the client CRUD endpoints (`/api/auth/oauth2/create-client` and friends) that any signed-in user could otherwise use, e.g. to register a client called "Claude Code"; CIMD registration does not go through them.
- Dynamic Client Registration stays off, as MCP deprecates it.

### Discovery

- Clients look under the root `/.well-known/`, which the `/api/auth` catch-all never sees, so `app/.well-known/` has route handlers for the protected resource metadata (root and `/api/mcp` alias, answered by the `mcp()` plugin through `auth.handler`) and for the authorization server metadata at `/.well-known/oauth-authorization-server/api/auth` and `/.well-known/openid-configuration/api/auth`.
- `/api/auth/.well-known/openid-configuration` and `/api/auth/jwks` are served by the auth handler itself.

### Login and consent

- Better Auth sends the browser to `/login` (signed out) and `/consent` with the authorization request in the query, signed and valid for 10 minutes; `lib/oauth-query.ts` verifies it.
- After sign-in (or sign-up, through the usual `?next=`), `/login` sends the user back to `/api/auth/oauth2/authorize` with the original request minus the signature and `prompt=login`, which then finds the session and continues to consent.
- `/consent` names the app and, for a CIMD client, the host of its client id, which is the only part the app cannot make up; Allow and Deny post from the browser to `/api/auth/oauth2/consent`, which answers with the client's redirect URI carrying the code or `access_denied`.

## Connecting clients

Start the app (`npm run dev`); in production `BETTER_AUTH_URL` must be the public HTTPS origin.

### Claude Code

- `claude mcp add --transport http todo-cat-web http://localhost:3000/api/mcp` registers it (local scope; `-s user` for every project); a different name than the stdio server's `todo-cat` keeps both usable.
- `/mcp` in Claude Code, then the server and Authenticate (or `claude mcp login todo-cat-web` in a shell), opens the browser for sign-in and consent; Claude Code refreshes the token itself.
- Its client id is `https://claude.ai/oauth/claude-code-client-metadata`, whose redirect URIs are loopback without a port; Better Auth accepts any port on a loopback redirect, so `--callback-port` is not needed.

### MCPJam CLI

- Sign in once and store the tokens: `npx -y @mcpjam/cli@latest oauth login --url http://localhost:3000/api/mcp --protocol-version 2026-07-28 --registration cimd --redirect-url http://localhost:6274/callback --credentials-out mcpjam-creds.json`.
- `--redirect-url` is required in practice: MCPJam's metadata document (`https://www.mcpjam.com/.well-known/oauth/client-metadata.json`) lists only the ports 6274 and 5173, while the CLI otherwise picks a random port.
- List and call: `npx -y @mcpjam/cli@latest tools list --url http://localhost:3000/api/mcp --credentials-file mcpjam-creds.json`, and `tools call ... --tool-name add --tool-args '{"title":"Buy cat food"}'`; `--access-token <token>` replaces the credentials file.
- Keep `mcpjam-creds.json` out of git; it holds a refresh token.

## Tests

- `app/api/mcp/route.test.ts` runs the whole flow in-process through the real route handlers: the 401 challenge, a session token and a cookie refused, a foreign `Origin` refused, both discovery documents, client CRUD refused, then a CIMD client through authorize, consent, and token for two users, whose MCP clients each see and change only their own todos.
- It mocks `@better-auth/cimd/node` to serve the metadata document from memory and stubs `fetch` so the JWKS request reaches the auth route.
- `e2e/mcp-consent.spec.ts` covers the browser part: sign-up and sign-in detours from an authorization request, Allow and Deny, and a forged consent link.

## Gotchas

- Creating `auth` seeds the OAuth resource table right away, so tests migrate before importing anything that imports `lib/auth.ts`, and the app needs `npm run db:migrate` after pulling this change.
- `authConfig` is a function because plugin instances hold state: two auth instances sharing them (the real one and a test's) fail with "register client discovery id "cimd" more than once".
- `npm run auth:generate` strips each plugin's `init` in `db/auth-cli.ts`, because the provider's seeding fails on the mock database.
- `mcpResource` comes from `BETTER_AUTH_URL`, and the token audience must match it exactly, so connect with the same host (`localhost` is not `127.0.0.1`).
- The consent decision cannot be a Server Action: `auth.api.oauth2Consent` continues with the authorize endpoint, which requires the HTTP request that server-side calls lack.
- The signature covers every query parameter, so nothing may be added to the query of `/login` or `/consent` while it is being verified.
- A request with `sec-fetch-mode` (browsers' `fetch`, and Node's) gets `{ redirect, url }` JSON from authorize and consent instead of a 302, and Better Auth's origin check wants an `Origin` header on such requests.
- CIMD rejects loopback and non-HTTPS client ids, so a client cannot be faked locally; the e2e test writes its client straight into the database instead.
- Chrome refuses navigation to "unsafe" ports such as 9, so test redirect URIs use a high port.
