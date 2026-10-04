// @vitest-environment node
import { A2uiMessageSchema, MessageProcessor } from "@a2ui/web_core/v0_9";
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  type RunAgentInput,
} from "@ag-ui/client";
import { from, lastValueFrom, type Observable, toArray } from "rxjs";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { lissieCatalog } from "@/app/lissie-catalog";
import { LissieCards, lissieCard } from "@/lib/lissie-cards";
import { LISSIE_CATALOG_ID } from "@/lib/lissie-tool-schemas";

const progress = { total: 3, done: 1, open: 2 };

// A2UI's message schema is Zod 3, so it parses each operation on its own.
const containerSchema = z.object({ a2ui_operations: z.array(z.unknown()) });

describe("the progress card", () => {
  const bindingSchema = z.object({ path: z.string() });

  // Every number anywhere in a component tree, which should have none: the card binds its numbers.
  function numbersIn(value: unknown): number[] {
    if (typeof value === "number") return [value];
    if (Array.isArray(value)) return value.flatMap(numbersIn);
    if (value && typeof value === "object") {
      return Object.values(value).flatMap(numbersIn);
    }
    return [];
  }

  test("is well-formed A2UI for the chat's catalog, named after the call, with the result's numbers", () => {
    const card = lissieCard("showProgress", "call-1", progress);
    expect(card).toMatchObject({
      id: "a2ui-surface-call-1",
      role: "activity",
      activityType: "a2ui-surface",
    });
    const operations = containerSchema
      .parse(card?.content)
      .a2ui_operations.map((operation) => A2uiMessageSchema.parse(operation));

    // The spec's order: create the surface in the chat's catalog, set the tree, fill the data model.
    const [create, update, data] = operations;
    if (
      !("createSurface" in create) ||
      !("updateComponents" in update) ||
      !("updateDataModel" in data)
    ) {
      throw new Error(
        "expected createSurface, updateComponents, updateDataModel",
      );
    }
    expect(operations).toHaveLength(3);
    expect(create.createSurface.catalogId).toBe(LISSIE_CATALOG_ID);

    // Every component is in the catalog, valid for it, and reachable from the one root.
    const { components } = update.updateComponents;
    const ids = new Set(components.map((component) => component.id));
    expect(ids.has("root")).toBe(true);
    for (const { id, component, ...props } of components) {
      const api = lissieCatalog.components.get(component);
      expect(api, `${id} is a ${component}`).toBeDefined();
      expect(api?.schema.safeParse(props).success, id).toBe(true);
      const children = z.array(z.string()).safeParse(props.children);
      for (const child of children.data ?? [])
        expect(ids.has(child)).toBe(true);
    }
    expect(numbersIn(components)).toEqual([]);

    // The chat's processor accepts the operations, and the bar's bindings resolve to the result's numbers.
    const processor = new MessageProcessor([lissieCatalog]);
    processor.processMessages(operations);
    const surface = processor.model.getSurface(create.createSurface.surfaceId);
    expect(surface?.dataModel.get("/")).toEqual(progress);
    const bar = components.find(
      (component) => component.component === "ProgressBar",
    );
    expect(surface?.dataModel.get(bindingSchema.parse(bar?.value).path)).toBe(
      progress.done,
    );
    expect(surface?.dataModel.get(bindingSchema.parse(bar?.max).path)).toBe(
      progress.total,
    );
  });

  test("a failed call or another tool has no card", () => {
    expect(lissieCard("showProgress", "call-1", undefined)).toBeUndefined();
    expect(
      lissieCard("showProgress", "call-1", { error: "boom" }),
    ).toBeUndefined();
    expect(lissieCard("listTodos", "call-1", progress)).toBeUndefined();
    expect(lissieCard("toString", "call-1", progress)).toBeUndefined();
  });
});

// An agent that streams the given events, standing in for the Mastra bridge.
class ScriptedAgent extends AbstractAgent {
  constructor(private readonly events: BaseEvent[]) {
    super();
  }

  run(): Observable<BaseEvent> {
    return from(this.events);
  }
}

const input: RunAgentInput = {
  threadId: "thread",
  runId: "run",
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};

function start(toolCallId: string, toolCallName: string): BaseEvent {
  return { type: EventType.TOOL_CALL_START, toolCallId, toolCallName };
}

function end(toolCallId: string): BaseEvent {
  return { type: EventType.TOOL_CALL_END, toolCallId };
}

function result(toolCallId: string, value: unknown): BaseEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${toolCallId}-result`,
    toolCallId,
    content: JSON.stringify(value),
  };
}

describe("LissieCards", () => {
  // Parallel calls stream every start before the first result. The runtime's A2UI middleware named this surface
  // after listTodos, the last call started, which replay could not reproduce.
  test("puts each card right after its result, named after that call, even among parallel calls", async () => {
    const events = [
      { type: EventType.RUN_STARTED, threadId: "thread", runId: "run" },
      start("call-progress", "showProgress"),
      end("call-progress"),
      start("call-list", "listTodos"),
      end("call-list"),
      result("call-progress", progress),
      result("call-list", { todos: [] }),
      { type: EventType.RUN_FINISHED, threadId: "thread", runId: "run" },
    ];

    const out = await lastValueFrom(
      new LissieCards().run(input, new ScriptedAgent(events)).pipe(toArray()),
    );

    const card = lissieCard("showProgress", "call-progress", progress);
    expect(out).toEqual([
      ...events.slice(0, 6),
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: "a2ui-surface-call-progress",
        activityType: "a2ui-surface",
        content: card?.content,
        replace: true,
      },
      ...events.slice(6),
    ]);
  });

  test("a failed call paints nothing", async () => {
    const events = [
      start("call-progress", "showProgress"),
      result("call-progress", "Lissie's tools need a signed-in user"),
    ];

    const out = await lastValueFrom(
      new LissieCards().run(input, new ScriptedAgent(events)).pipe(toArray()),
    );

    expect(out).toEqual(events);
  });
});
