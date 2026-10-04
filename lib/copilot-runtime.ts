import "server-only";
import { type BaseEvent, EventType } from "@ag-ui/client";
import { MastraAgent } from "@ag-ui/mastra";
import {
  type AgentRunnerConnectRequest,
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
  type RouteInfo,
} from "@copilotkit/runtime/v2";
import { Observable } from "rxjs";
import { z } from "zod";
import {
  LISSIE_AGENT_ID,
  lissie,
  lissieRequestContext,
  lissieThreadId,
  loadLissieHistory,
} from "@/lib/lissie";

// The CopilotKit runtime that serves Lissie over AG-UI at /api/copilotkit; see tech-docs/agent.md.
// The route resolves the signed-in user first and builds this handler per request around their id,
// so the agent's memory scope, the user its tools act for, and every authorization decision come from the server session.

export const COPILOTKIT_BASE_PATH = "/api/copilotkit";

// Runs stream through the in-memory runner, whose store is process-wide, so a run started by one request
// can be reconnected to or stopped by the next. Mastra memory is the durable copy: when no run is active,
// connect replays the conversation from there, which also covers a restarted server.
class LissieRunner extends InMemoryAgentRunner {
  constructor(private readonly userId: string) {
    super();
  }

  override connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let inner: { unsubscribe(): void } | undefined;
      this.isRunning(request)
        .then(async (running) => {
          if (running) {
            inner = super.connect(request).subscribe(subscriber);
            return;
          }
          const messages = await loadLissieHistory(this.userId);
          if (messages.length > 0) {
            subscriber.next({ type: EventType.MESSAGES_SNAPSHOT, messages });
          }
          subscriber.complete();
        })
        .catch((error: unknown) => subscriber.error(error));
      return () => inner?.unsubscribe();
    });
  }
}

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

const runInputSchema = z.object({ threadId: z.string() });

// The thread a run or connect request names in its AG-UI body; the handler still reads the original.
async function bodyThreadId(request: Request): Promise<string | undefined> {
  try {
    return runInputSchema.parse(await request.clone().json()).threadId;
  } catch {
    return undefined;
  }
}

// Every route the runtime serves passes through here (see RouteInfo). Default deny: the user may talk to
// Lissie on their own thread and nothing else, so a route the runtime adds later is refused until listed.
// Another user's thread is "not found", never "forbidden", like a todo (tech-docs/architecture.md).
export async function authorizeRoute(
  route: RouteInfo,
  request: Request,
  userId: string,
): Promise<void> {
  const ownThread = lissieThreadId(userId);
  switch (route.method) {
    case "info":
      return;
    case "agent/run":
    case "agent/connect":
      if (
        route.agentId !== LISSIE_AGENT_ID ||
        (await bodyThreadId(request)) !== ownThread
      ) {
        throw notFound();
      }
      return;
    case "agent/stop":
      if (route.agentId !== LISSIE_AGENT_ID || route.threadId !== ownThread) {
        throw notFound();
      }
      return;
    default:
      // Thread listing, history, state, clearing and mutations, suggestions, transcription,
      // inspector, memories, annotations, trajectories, and debug events: the chat needs none of them.
      throw notFound();
  }
}

export function createLissieHandler(
  userId: string,
): (request: Request) => Promise<Response> {
  const runtime = new CopilotRuntime({
    agents: {
      [LISSIE_AGENT_ID]: new MastraAgent({
        agentId: LISSIE_AGENT_ID,
        agent: lissie,
        resourceId: userId,
        // The only way the user id reaches Lissie's tools (lib/lissie-tools.ts); the bridge adds the client's AG-UI
        // context under its own "ag-ui" key and never touches these.
        requestContext: lissieRequestContext(userId),
        // Never inject `generate_a2ui`, even when a request's forwardedProps ask for it.
        a2ui: { injectA2UITool: false },
      }),
    },
    // The A2UI middleware paints the surfaces Lissie's tools return (showProgress). No generated surfaces: it injects
    // no render tool, which the chat's catalog would otherwise switch on, and treats no streamed tool call as one.
    a2ui: {
      agents: [LISSIE_AGENT_ID],
      injectA2UITool: false,
      a2uiToolNames: [],
    },
    runner: new LissieRunner(userId),
    // By default the runtime forwards `authorization` and `x-*` request headers to the agent, and the Mastra
    // bridge sends them on to OpenRouter: a bearer client's session token would leak and clobber the API key.
    // These are all the headers it would forward, so nothing is.
    forwardHeaders: { deny: ["authorization"], denyPrefixes: ["x-"] },
  });
  return createCopilotRuntimeHandler({
    runtime,
    basePath: COPILOTKIT_BASE_PATH,
    hooks: {
      onBeforeHandler: ({ route, request }) =>
        authorizeRoute(route, request, userId),
    },
  });
}
