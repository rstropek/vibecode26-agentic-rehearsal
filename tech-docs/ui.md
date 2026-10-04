# UI

## Direction: "Scratched off"

Lissie's ledger: a to-do list kept by a cat who doesn't tick things off, she claws them off.

- **Color** comes from the cat: lilac coat-grey paper, plum ink, whisker-grey muted text, her amber eyes for focus, checks, and claw marks, and her rose nose for overdue dates and delete. Every color has a light and a dark value; the app follows `prefers-color-scheme` and never sets a `.dark` class.
- **Type** is one family, Bricolage Grotesque, in two voices: Lissie's voice (headlines, the wordmark, "Your list") at its narrowest width (75) and heaviest weight, and the UI at normal width. Counts, dates, and the CLI code use tabular figures; there is no monospace face.
- **Layout**: the chat sits directly on the paper, and the list is the one raised object, a full-height sheet on the right from `lg`, below the chat on smaller screens. The auth and device pages are a big left-aligned headline (Lissie's line) over a narrow form column.
- **Signature**: three tapered amber claw strokes through a done todo's first line. Checking a todo scratches it off in place (about 300 ms), then it moves to Done; a todo Lissie marks done gets scratched as it lands in Done; todos already done when the page loads just carry the marks. Reduced motion skips the scratching.
- **Restraint**: the claws are the only flourish. No other entrance animations, cards, gradients, all-caps labels, or icons in button text.
- **Copy**: sentence case, plain verbs, Lissie's attitude in headlines and empty states only; buttons say what happens ("Add", "Delete", "Keep").

## Where things live

- `app/globals.css`: the color tokens (`paper`, `paper-raised`, `ink`, `muted`, `line`, `amber`, `on-amber`, `danger`) and their dark values, the `voice` utility (Lissie's condensed type), the claw-mark animation, and every CopilotKit override.
- `app/layout.tsx`: loads Bricolage with its `wdth` and `opsz` axes, which `voice` needs.
- `components/ui/`: `Button` (primary, quiet, danger; md and sm), `Field` and `inputClassName`, `FormError`, `TextLink`, `PageShell` (the auth and device pages), and `Wordmark`; pages compose these instead of repeating class strings.
- `app/page.tsx`: the home layout; `app/todo-list.tsx`: the list sheet with the add form, the items, the delete confirmation, and the claw marks.
- `app/todo-actions.ts`: the list's Server Actions (see [architecture.md](architecture.md)).

## The list

- Writes are optimistic (`useOptimistic`) and the actions call `refresh()`, so the server's list replaces the guess in the same transition; the sheet is `aria-busy` until then, which e2e tests wait for before reloading.
- Delete asks inline (a fieldset with Delete and Keep) and focuses Keep; Escape or Keep returns focus to the delete button.
- Due dates read "Due Fri, Oct 9", "Due today", or "Was due Fri, Oct 2" in rose for open todos; "today" is the server's date (`localToday` in `lib/due-date.ts`), like Lissie's.

## CopilotKit styling gotchas

- The chat's shadcn tokens are mapped to the app's tokens in `app/globals.css` on every `[data-copilotkit]` under `:root`, because tooltips and menus portal to `<body>` outside the chat.
- CopilotKit's `--muted` is a surface (user bubbles, hovers), ours is a text color, so the mapping goes through `--color-*`; inside the chat, `text-muted` resolves to CopilotKit's surface and disappears, so use `text-(--color-muted)`, as the tool lines in `app/lissie-tool-calls.tsx` do.
- CopilotKit hard-codes greys (message prose, input, send and toolbar buttons, floating surfaces) and darkens them only under `.dark`, so `globals.css` overrides them by `data-testid`; its utilities sit in `@layer utilities`, so the unlayered overrides win but must restate hover and disabled states.
- The user's bubble is `--muted` (raised) plus a hairline `box-shadow` from `globals.css`; the chat's own background is the page paper.
- Check every chat change in both color schemes; a new CopilotKit element usually brings its own hard-coded grey.

## Checking the design

- Look at screenshots of the running app in light and dark, at desktop (1440 wide) and phone (390 wide) widths, before calling a UI change done; Playwright's `colorScheme` and `viewport` context options cover all four.
- The demo user (`npm run db:seed`) has open, overdue, due-today, and done todos plus a chat history, which shows most states at once.
