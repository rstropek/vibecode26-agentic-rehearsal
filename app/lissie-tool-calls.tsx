"use client";

import { useAgent, useRenderTool } from "@copilotkit/react-core/v2";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import type { z } from "zod";
import { formatDueDate } from "@/lib/due-date";
import {
  addTodoInputSchema,
  addTodoOutputSchema,
  LISSIE_TOOL_NAMES,
  listTodosInputSchema,
  listTodosOutputSchema,
  setTodoDoneInputSchema,
  setTodoDoneOutputSchema,
  showProgressInputSchema,
  showProgressOutputSchema,
} from "@/lib/lissie-tool-schemas";

// What Lissie did with her tools, as one readable line per call in the chat, and the refresh that keeps the
// list on the page in step with her changes. Both must sit inside <CopilotKit>.

type Status = "inProgress" | "executing" | "complete";
type Outcome = "running" | "done" | "failed";

// A tool result arrives as the JSON of what the tool returned; anything else (such as Mastra's input validation
// error) is a failed call.
export function parseToolResult<S extends z.ZodType>(
  schema: S,
  result: string | undefined,
): z.output<S> | undefined {
  if (result === undefined) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(result));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// Inside the chat, CopilotKit redefines --muted as a surface color, so muted text reads --color-muted, which keeps
// the app's value (see app/globals.css).
function ToolLine({
  outcome,
  children,
}: {
  outcome: Outcome;
  children: ReactNode;
}) {
  const mark = { running: "…", done: "✓", failed: "✗" }[outcome];
  return (
    <p
      data-testid="lissie-tool-call"
      className="my-1 flex items-baseline gap-2 text-sm text-(--color-muted)"
    >
      <span
        aria-hidden="true"
        className={outcome === "failed" ? "text-danger" : "text-amber"}
      >
        {mark}
      </span>
      <span>{children}</span>
    </p>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink">“{children}”</span>;
}

export function ListTodosLine({
  status,
  parameters,
  result,
}: {
  status: Status;
  parameters: Partial<z.output<typeof listTodosInputSchema>>;
  result?: string;
}) {
  if (status !== "complete") {
    return <ToolLine outcome="running">Reading your list</ToolLine>;
  }
  const output = parseToolResult(listTodosOutputSchema, result);
  if (!output) {
    return <ToolLine outcome="failed">Couldn’t read your list</ToolLine>;
  }
  const { todos } = output;
  if (parameters.search) {
    return (
      <ToolLine outcome="done">
        Searched your list for <Title>{parameters.search}</Title>:{" "}
        {todos.length} found
      </ToolLine>
    );
  }
  const done = todos.filter((todo) => todo.done).length;
  return (
    <ToolLine outcome="done">
      Read your list: {todos.length - done} open, {done} done
    </ToolLine>
  );
}

export function AddTodoLine({
  status,
  parameters,
  result,
}: {
  status: Status;
  parameters: Partial<z.output<typeof addTodoInputSchema>>;
  result?: string;
}) {
  const title = parameters.title ? <Title>{parameters.title}</Title> : null;
  if (status !== "complete") {
    return <ToolLine outcome="running">Adding {title ?? "a todo"}</ToolLine>;
  }
  const output = parseToolResult(addTodoOutputSchema, result);
  if (!output) {
    return (
      <ToolLine outcome="failed">Couldn’t add {title ?? "that todo"}</ToolLine>
    );
  }
  const { todo } = output;
  return (
    <ToolLine outcome="done">
      Added <Title>{todo.title}</Title>
      {todo.dueDate ? `, due ${formatDueDate(todo.dueDate)}` : null}
    </ToolLine>
  );
}

export function SetTodoDoneLine({
  status,
  parameters,
  result,
}: {
  status: Status;
  parameters: Partial<z.output<typeof setTodoDoneInputSchema>>;
  result?: string;
}) {
  const reopening = parameters.done === false;
  if (status !== "complete") {
    return (
      <ToolLine outcome="running">
        {reopening ? "Reopening a todo" : "Marking a todo done"}
      </ToolLine>
    );
  }
  const output = parseToolResult(setTodoDoneOutputSchema, result);
  if (!output || "error" in output) {
    return (
      <ToolLine outcome="failed">
        {reopening
          ? "Couldn’t reopen that todo"
          : "Couldn’t mark that todo done"}
      </ToolLine>
    );
  }
  const { todo } = output;
  return (
    <ToolLine outcome="done">
      {todo.done ? (
        <>
          Marked <Title>{todo.title}</Title> done
        </>
      ) : (
        <>
          Reopened <Title>{todo.title}</Title>
        </>
      )}
    </ToolLine>
  );
}

// Once the numbers are in, the progress card that follows the result shows them (lib/lissie-cards.ts), so the line
// only shows the call running or failing.
export function ShowProgressLine({
  status,
  result,
}: {
  status: Status;
  result?: string;
}) {
  if (status !== "complete") {
    return <ToolLine outcome="running">Counting your todos</ToolLine>;
  }
  if (!parseToolResult(showProgressOutputSchema, result)) {
    return <ToolLine outcome="failed">Couldn’t count your todos</ToolLine>;
  }
  return null;
}

export function useLissieToolRenderers(): void {
  useRenderTool(
    {
      name: LISSIE_TOOL_NAMES.listTodos,
      parameters: listTodosInputSchema,
      render: ListTodosLine,
    },
    [],
  );
  useRenderTool(
    {
      name: LISSIE_TOOL_NAMES.addTodo,
      parameters: addTodoInputSchema,
      render: AddTodoLine,
    },
    [],
  );
  useRenderTool(
    {
      name: LISSIE_TOOL_NAMES.setTodoDone,
      parameters: setTodoDoneInputSchema,
      render: SetTodoDoneLine,
    },
    [],
  );
  useRenderTool(
    {
      name: LISSIE_TOOL_NAMES.showProgress,
      parameters: showProgressInputSchema,
      render: ShowProgressLine,
    },
    [],
  );
}

const CHANGING_TOOLS: ReadonlySet<string> = new Set([
  LISSIE_TOOL_NAMES.addTodo,
  LISSIE_TOOL_NAMES.setTodoDone,
]);

// Re-renders the page's Server Components (the list next to the chat) whenever a tool that changes the list returns.
// Only live events count: a replayed conversation arrives as one snapshot and changes nothing.
export function useRefreshWhenLissieChangesTodos(agentId: string): void {
  const { agent } = useAgent({ agentId });
  const router = useRouter();
  useEffect(() => {
    const changing = new Set<string>();
    const { unsubscribe } = agent.subscribe({
      onToolCallStartEvent: ({ event }) => {
        if (CHANGING_TOOLS.has(event.toolCallName)) {
          changing.add(event.toolCallId);
        }
      },
      onToolCallResultEvent: ({ event }) => {
        if (changing.delete(event.toolCallId)) router.refresh();
      },
    });
    return unsubscribe;
  }, [agent, router]);
}
