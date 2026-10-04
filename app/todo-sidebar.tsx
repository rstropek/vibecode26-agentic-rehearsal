import type { Todo } from "@todo-cat/contract";
import { formatDueDate } from "@/lib/due-date";

// The user's list next to the chat, read-only: Lissie is the only way to change it in the browser for now.
// The page re-renders it when one of her tools changes a todo (app/lissie-tool-calls.tsx).
export function TodoSidebar({ todos }: { todos: Todo[] }) {
  const open = todos.filter((todo) => !todo.done);
  const done = todos.filter((todo) => todo.done);
  return (
    <aside
      aria-labelledby="todo-sidebar-heading"
      className="flex shrink-0 flex-col gap-6 lg:w-80 lg:overflow-y-auto lg:pt-10"
    >
      <h2
        id="todo-sidebar-heading"
        className="text-2xl font-extrabold tracking-tight text-ink"
      >
        Your list
      </h2>
      <TodoSection
        title="Open"
        todos={open}
        empty="Nothing open. Tell Lissie what needs doing."
      />
      <TodoSection
        title="Done"
        todos={done}
        empty="Nothing done yet. Lissie has noticed."
      />
    </aside>
  );
}

function TodoSection({
  title,
  todos,
  empty,
}: {
  title: string;
  todos: Todo[];
  empty: string;
}) {
  const headingId = `todo-sidebar-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-base font-bold text-ink">
        {title} <span className="font-normal text-muted">{todos.length}</span>
      </h3>
      {todos.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TodoItem({ todo }: { todo: Todo }) {
  return (
    <li className="flex gap-3 border-t border-line py-2 first:border-t-0">
      {todo.done ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="mt-1.5 size-3 shrink-0 text-amber"
        >
          <path
            d="M2 6.5 5 9.5 10 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span
          aria-hidden="true"
          className="mt-1.5 size-3 shrink-0 rounded-full border-2 border-line"
        />
      )}
      <span className="flex min-w-0 flex-col">
        <span
          className={`break-words ${todo.done ? "text-muted" : "text-ink"}`}
        >
          {todo.title}
        </span>
        {todo.dueDate ? (
          <span className="text-sm text-muted">
            Due {formatDueDate(todo.dueDate)}
          </span>
        ) : null}
      </span>
    </li>
  );
}
