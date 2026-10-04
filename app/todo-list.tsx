"use client";

import type { Todo } from "@todo-cat/contract";
import {
  useActionState,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  addTodoAction,
  deleteTodoAction,
  setTodoDoneAction,
  type TodoActionState,
} from "@/app/todo-actions";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { formatDueDate } from "@/lib/due-date";

// The user's list next to the chat: add, check off, reopen, and delete through the Server Actions in
// app/todo-actions.ts. The page re-renders it after each write and whenever one of Lissie's tools changes a todo
// (app/lissie-tool-calls.tsx); until then, useOptimistic shows the change.

type Change = { id: string; done: boolean } | { id: string; deleted: true };

function applyChange(todos: Todo[], change: Change): Todo[] {
  if ("deleted" in change) return todos.filter((todo) => todo.id !== change.id);
  return todos.map((todo) =>
    todo.id === change.id ? { ...todo, done: change.done } : todo,
  );
}

export function TodoList({ todos, today }: { todos: Todo[]; today: string }) {
  const [shown, applyOptimistic] = useOptimistic(todos, applyChange);
  const [error, setError] = useState<string>();
  const [saving, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Claws draw only on todos that become done while the page is open, and only once: a todo the user scratched off
  // in place does not draw again when it lands in Done.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [scratchedInPlace, setScratchedInPlace] = useState<ReadonlySet<string>>(
    new Set(),
  );

  function write(change: Change, action: () => Promise<TodoActionState>) {
    setError(undefined);
    startTransition(async () => {
      applyOptimistic(change);
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  // Checking or reopening moves a todo to the other section; its checkbox there takes the focus.
  const [movedId, setMovedId] = useState<string>();

  function setDone(todo: Todo, done: boolean, inPlace: boolean) {
    setMovedId(todo.id);
    if (inPlace) setScratchedInPlace((ids) => new Set(ids).add(todo.id));
    write({ id: todo.id, done }, () => setTodoDoneAction(todo.id, done));
  }

  function remove(todo: Todo) {
    headingRef.current?.focus();
    write({ id: todo.id, deleted: true }, () => deleteTodoAction(todo.id));
  }

  const sections = [
    {
      title: "Open",
      todos: shown.filter((todo) => !todo.done),
      empty: "Nothing open. Add a todo, or tell Lissie what needs doing.",
    },
    {
      title: "Done",
      todos: shown.filter((todo) => todo.done),
      empty: "Nothing scratched off yet. Lissie has noticed.",
    },
  ];

  return (
    <aside
      aria-labelledby="todo-list-heading"
      aria-busy={saving}
      className="flex flex-col border-t border-line bg-paper-raised lg:h-dvh lg:border-t-0 lg:border-l"
    >
      <div className="flex flex-col gap-5 px-5 pt-8 pb-5 sm:px-8">
        <h2
          id="todo-list-heading"
          ref={headingRef}
          tabIndex={-1}
          className="voice text-4xl text-ink outline-none"
        >
          Your list
        </h2>
        <AddTodoForm />
        <FormError>{error}</FormError>
      </div>
      <div className="flex flex-col gap-8 px-5 pb-12 sm:px-8 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {sections.map((section) => (
          <section
            key={section.title}
            aria-labelledby={`todo-list-${section.title.toLowerCase()}`}
            className="flex flex-col gap-1"
          >
            <h3
              id={`todo-list-${section.title.toLowerCase()}`}
              className="flex items-baseline gap-2 text-base font-bold text-ink"
            >
              {section.title}
              <span className="font-normal text-muted tabular-nums">
                {section.todos.length}
              </span>
            </h3>
            {section.todos.length === 0 ? (
              <p className="py-2 text-sm text-muted">{section.empty}</p>
            ) : (
              <ul className="flex flex-col">
                {section.todos.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    today={today}
                    drawClaws={hydrated && !scratchedInPlace.has(todo.id)}
                    takeFocus={todo.id === movedId}
                    onSetDone={(done, inPlace) => setDone(todo, done, inPlace)}
                    onDelete={() => remove(todo)}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}

function AddTodoForm() {
  const [state, action, pending] = useActionState<TodoActionState, FormData>(
    addTodoAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError>{state.error}</FormError>
      <label htmlFor="new-todo-title" className="sr-only">
        New todo
      </label>
      <input
        id="new-todo-title"
        name="title"
        required
        maxLength={200}
        autoComplete="off"
        placeholder="Add a todo"
        defaultValue={state.title}
        className={inputClassName}
      />
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-3 text-sm font-medium text-muted">
          Due
          <input
            type="date"
            name="dueDate"
            defaultValue={state.dueDate}
            className={`${inputClassName} flex-1`}
          />
        </label>
        <Button disabled={pending}>Add</Button>
      </div>
    </form>
  );
}

function dueLine(todo: Todo, today: string): { text: string; tone: string } {
  if (!todo.dueDate) return { text: "", tone: "" };
  const day = formatDueDate(todo.dueDate);
  if (todo.done) return { text: `Due ${day}`, tone: "text-muted" };
  if (todo.dueDate < today)
    return { text: `Was due ${day}`, tone: "text-danger" };
  if (todo.dueDate === today)
    return { text: "Due today", tone: "font-semibold text-ink" };
  return { text: `Due ${day}`, tone: "text-muted" };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function TodoItem({
  todo,
  today,
  drawClaws,
  takeFocus,
  onSetDone,
  onDelete,
}: {
  todo: Todo;
  today: string;
  drawClaws: boolean;
  takeFocus: boolean;
  onSetDone: (done: boolean, inPlace: boolean) => void;
  onDelete: () => void;
}) {
  const id = useId();
  // Checking a todo first scratches it off where it is; it moves to Done when the claws are through.
  const [scratching, setScratching] = useState(false);
  // Fixed at mount: a todo already done when it appears keeps still claws.
  const [drawOnMount] = useState(drawClaws);
  const [focusOnMount] = useState(takeFocus);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const done = todo.done || scratching;
  const due = dueLine(todo, today);

  useEffect(() => {
    if (focusOnMount) checkboxRef.current?.focus();
  }, [focusOnMount]);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  function toggle(checked: boolean) {
    if (scratching) return;
    if (checked && !prefersReducedMotion()) setScratching(true);
    else onSetDone(checked, false);
  }

  function keep() {
    setConfirming(false);
    deleteRef.current?.focus();
  }

  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 border-t border-line py-2.5 first:border-t-0">
      <span className="relative mt-1 flex size-5">
        <input
          ref={checkboxRef}
          id={id}
          type="checkbox"
          checked={done}
          aria-describedby={due.text ? `${id}-due` : undefined}
          onChange={(event) => toggle(event.target.checked)}
          className="peer size-5 cursor-pointer appearance-none rounded-[5px] border-2 border-muted bg-paper-raised transition-colors outline-none checked:border-amber checked:bg-amber hover:border-ink focus-visible:ring-3 focus-visible:ring-amber/60 checked:hover:border-amber"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute inset-0 hidden text-on-amber peer-checked:block"
        >
          <path
            d="M5.5 10.5 8.5 13.5 14.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer leading-snug">
          <span
            className={`relative inline-block max-w-full break-words transition-colors ${done ? "text-muted" : "text-ink"}`}
          >
            {todo.title}
            {done ? (
              <ClawMarks
                drawing={scratching || drawOnMount}
                onDrawn={scratching ? () => onSetDone(true, true) : undefined}
              />
            ) : null}
          </span>
        </label>
        {due.text ? (
          <p id={`${id}-due`} className={`text-sm tabular-nums ${due.tone}`}>
            {due.text}
          </p>
        ) : null}
      </div>
      <button
        ref={deleteRef}
        type="button"
        aria-label={`Delete ${todo.title}`}
        aria-expanded={confirming}
        onClick={() => setConfirming(true)}
        className="-my-1 flex size-9 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-3 focus-visible:ring-amber aria-expanded:bg-danger/10 aria-expanded:text-danger"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4.5">
          <path
            d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {confirming ? (
        <fieldset
          aria-label={`Delete ${todo.title}?`}
          onKeyDown={(event) => {
            if (event.key === "Escape") keep();
          }}
          className="col-start-2 col-end-4 mt-2 flex flex-wrap items-center gap-2"
        >
          <p className="mr-auto text-sm text-ink">Delete it for good?</p>
          <Button type="button" size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
          <Button
            ref={keepRef}
            type="button"
            size="sm"
            variant="quiet"
            onClick={keep}
          >
            Keep
          </Button>
        </fieldset>
      ) : null}
    </li>
  );
}

// A tapered claw stroke from (x1, y1) to (x2, y2), arching up a little and `width` thick in the middle.
function claw(x1: number, y1: number, x2: number, y2: number, width: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 1.5;
  return `M${x1} ${y1}Q${mx} ${my - width} ${x2} ${y2}Q${mx} ${my + width} ${x1} ${y1}Z`;
}

const CLAWS = [
  claw(4, 9.5, 95, 3, 4.2),
  claw(2, 15, 97, 8.5, 4.8),
  claw(7, 20.5, 92, 14.5, 3.8),
];

// Three claw strokes over the title's first line, in a box that stretches with the title (preserveAspectRatio="none").
// The scratching animation is in app/globals.css.
function ClawMarks({
  drawing,
  onDrawn,
}: {
  drawing: boolean;
  onDrawn?: () => void;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={`claw-marks pointer-events-none absolute -inset-x-1 -top-[0.05em] h-[1.5em] w-[calc(100%+0.5rem)] text-amber ${drawing ? "claw-marks-drawing" : ""}`}
    >
      {CLAWS.map((d, index) => (
        <path
          key={d}
          d={d}
          onAnimationEnd={index === CLAWS.length - 1 ? onDrawn : undefined}
        />
      ))}
    </svg>
  );
}
