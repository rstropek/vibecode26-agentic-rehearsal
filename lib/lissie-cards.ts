import "server-only";
import {
  type AbstractAgent,
  type ActivityMessage,
  type ActivitySnapshotEvent,
  type BaseEvent,
  EventType,
  Middleware,
  type RunAgentInput,
  type ToolCallResultEvent,
  type ToolCallStartEvent,
} from "@ag-ui/client";
import { mergeMap, type Observable } from "rxjs";
import {
  LISSIE_CATALOG_ID,
  LISSIE_TOOL_NAMES,
  showProgressOutputSchema,
} from "@/lib/lissie-tool-schemas";

// Lissie's cards: A2UI surfaces the chat shows for some tool results; see tech-docs/agent.md.
// A card tool returns only its data, which is all the model and memory see. The surface is built here from the
// tool's name and result, both live (LissieCards, on the run's events) and on replay (loadLissieHistory), so the two
// always produce the same surface under the same id.

// The progress card, authored once as an A2UI v0.9 component tree: the basic catalog's Column and Text plus the
// ProgressBar from app/lissie-catalog.tsx. The tree holds no numbers; its components bind to /total, /done, and
// /open in the surface's data model, which showProgress's result fills.
const PROGRESS_SURFACE_ID = "todo-progress";

const progressCard = [
  {
    id: "root",
    component: "Column",
    children: ["progress-title", "progress-bar", "progress-open"],
  },
  {
    id: "progress-title",
    component: "Text",
    variant: "h4",
    text: "Progress, such as it is",
  },
  {
    id: "progress-bar",
    component: "ProgressBar",
    label: "Done",
    value: { path: "/done" },
    max: { path: "/total" },
  },
  {
    id: "progress-open",
    component: "Text",
    // A data model value in a formatString template is written ${/path}, escaped here in a template literal.
    text: { call: "formatString", args: { value: `\${/open} still open` } },
  },
];

// The A2UI operations of each card tool's surface, built from its result: create the surface, set the tree, then
// fill the data model. A result that does not parse (a failed call) has no card.
const cards: Record<string, (result: unknown) => object[] | undefined> = {
  [LISSIE_TOOL_NAMES.showProgress]: (result) => {
    const parsed = showProgressOutputSchema.safeParse(result);
    if (!parsed.success) return undefined;
    const surfaceId = PROGRESS_SURFACE_ID;
    return [
      {
        version: "v0.9",
        createSurface: { surfaceId, catalogId: LISSIE_CATALOG_ID },
      },
      {
        version: "v0.9",
        updateComponents: { surfaceId, components: progressCard },
      },
      {
        version: "v0.9",
        updateDataModel: { surfaceId, path: "/", value: parsed.data },
      },
    ];
  },
};

// The card a tool call's result shows, as the activity message the chat renders with its A2UI catalog: one surface
// per call, named after the call, in the `a2ui_operations` container CopilotKit's A2UI renderer reads.
export function lissieCard(
  toolName: string,
  toolCallId: string,
  result: unknown,
): ActivityMessage | undefined {
  const operations = Object.hasOwn(cards, toolName)
    ? cards[toolName](result)
    : undefined;
  if (!operations) return undefined;
  return {
    id: `a2ui-surface-${toolCallId}`,
    role: "activity",
    activityType: "a2ui-surface",
    content: { a2ui_operations: operations },
  };
}

// A tool result's content: the JSON of what the tool returned (the Mastra bridge sends nothing else).
function parseJson(text: unknown): unknown {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isToolCallStart(event: BaseEvent): event is ToolCallStartEvent {
  return event.type === EventType.TOOL_CALL_START;
}

function isToolCallResult(event: BaseEvent): event is ToolCallResultEvent {
  return event.type === EventType.TOOL_CALL_RESULT;
}

// Paints each card right after its tool result, as an ACTIVITY_SNAPSHOT. The runtime's own A2UI middleware stays
// off (lib/copilot-runtime.ts): it names a surface after the last tool call started, not the one that returned it.
export class LissieCards extends Middleware {
  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    const toolNames = new Map<string, string>();
    return this.runNext(input, next).pipe(
      mergeMap((event): BaseEvent[] => {
        if (isToolCallStart(event)) {
          toolNames.set(event.toolCallId, event.toolCallName);
        }
        if (!isToolCallResult(event)) return [event];
        const toolName = toolNames.get(event.toolCallId);
        const card =
          toolName &&
          lissieCard(toolName, event.toolCallId, parseJson(event.content));
        if (!card) return [event];
        const surface: ActivitySnapshotEvent = {
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId: card.id,
          activityType: card.activityType,
          content: card.content,
          replace: true,
        };
        return [event, surface];
      }),
    );
  }
}
