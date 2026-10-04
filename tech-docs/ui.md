# UI

## Direction: "Scratched off"

Lissie's ledger: a to-do list kept by a cat who doesn't tick things off, she claws them off.

- **Color** comes from the cat: lilac coat-grey paper, plum ink, whisker-grey muted text, her amber eyes for focus, checks, and claw marks, and her rose nose for overdue dates and delete. Every color has a light and a dark value; the app follows `prefers-color-scheme` and never sets a `.dark` class.
- **Type** is one family, Bricolage Grotesque, in two voices: Lissie's voice (headlines, the wordmark, "Your list") at its narrowest width (75) and heaviest weight, and the UI at normal width. Counts, dates, and the CLI code (at normal width, so it is easy to compare with the terminal) use tabular figures; there is no monospace face, so commands like `todo-cat login` in running text are set in semibold ink.
- **Layout**: the chat sits directly on the paper, and the list is the one raised object, a full-height sheet on the right from `lg`, below the chat on smaller screens. The auth, device, and consent pages are a big left-aligned headline (Lissie's line) over a narrow form column.
- **Signature**: three tapered amber claw strokes through every line of a done todo's title, each line's strokes as wide as that line, under the text so it stays readable. Checking a todo scratches it off in place (about 300 ms), then it moves to Done; a todo Lissie marks done gets scratched as it lands in Done; todos already done when the page loads just carry the marks. Reduced motion skips the scratching.
- **Restraint**: the claws are the only flourish. No other entrance animations, cards, gradients, all-caps labels, or icons in button text.
- **Copy**: sentence case, plain verbs, Lissie's attitude in headlines and empty states only; buttons say what happens ("Add", "Delete", "Keep").

## Where things live

- `app/globals.css`: the color tokens (`paper`, `paper-raised`, `ink`, `muted`, `line`, `edge`, `amber`, `amber-strong`, `on-amber`, `danger`) and their dark values, the `voice` utility (Lissie's condensed type), the claws and their animation, the themed selection, caret, and scrollbars, and every CopilotKit override.
- `app/layout.tsx`: loads Bricolage with its `wdth` and `opsz` axes, which `voice` needs.
- `components/ui/`: `Button` (primary, quiet, danger; md and sm), `Field` (with an optional `hint`) and `inputClassName`, `FormError`, `TextLink`, `PageShell` (the auth, device, and consent pages), and `Wordmark` (a link to `/`); pages compose these instead of repeating class strings.
- `app/page.tsx`: the home layout and its header, which below `lg` links down to the list with the open count; `app/todo-list.tsx`: the list sheet with the add form, the items, and the delete confirmation.
- `app/todo-actions.ts`: the list's Server Actions (see [architecture.md](architecture.md)).
- `app/lissie-catalog.tsx`: `ProgressBar`, the one custom component in the chat's A2UI catalog: an amber fill on a `line` track, its label in ink, and the count in muted tabular figures.

## The progress card

- Lissie's progress card (see [agent.md](agent.md)) sits on the chat's paper like her messages, with no border or raised surface, since the list is the one raised object.
- Its title and "still open" line are A2UI's basic `Text`, which inherits the chat's font and ink; avoid its `caption` variant, which hard-codes `#666`, and its `Card`, which hard-codes a `#ccc` border.

## The list

- Writes are optimistic (`useOptimistic`) and the actions call `refresh()`, so the server's list replaces the guess in the same transition; the sheet is `aria-busy` until then, which e2e tests wait for before reloading.
- Delete asks inline (a fieldset with Delete and Keep) and focuses Keep; Escape or Keep returns focus to the delete button.
- After an add, focus returns to the title field, so several todos go in one after another with Enter.
- Due dates read "Due Fri, Oct 9", "Due today", or "Was due Fri, Oct 2" in rose for open todos; "today" is the server's date (`localToday` in `lib/due-date.ts`), like Lissie's.

## Contrast and touch

- `line` is for hairlines that separate; anything you operate (inputs, quiet buttons) is outlined in `edge`, and focus rings and the checked box's edge use `amber-strong`, because plain amber on the light paper is only about 2:1.
- On touch screens (`pointer-coarse:`) small buttons and the delete icon grow to 44px; the checkbox keeps its 20px box and gets a 44px hit area from a wrapping label's `::before`, with the input stacked above it so it still receives clicks.

## Claws gotchas

- The claws are three SVG backgrounds on the title's inline `<span>`, with `box-decoration-break: clone` so each wrapped line gets its own set; the SVGs are data URIs with the amber baked in, which is why `globals.css` repeats them in the dark block.
- The text sits on top of the strokes with a `text-shadow` halo in the sheet's color; without it, muted text on amber is unreadable in dark mode.
- The scratch animates `background-size`, and the list moves the todo to Done on the span's `animationend`.

## CopilotKit styling gotchas

- The chat's shadcn tokens are mapped to the app's tokens in `app/globals.css` on every `[data-copilotkit]` under `:root`, because tooltips and menus portal to `<body>` outside the chat.
- CopilotKit's `--muted` is a surface (user bubbles, hovers), ours is a text color, so the mapping goes through `--color-*`; inside the chat, `text-muted` resolves to CopilotKit's surface and disappears, so use `text-(--color-muted)`, as the tool lines in `app/lissie-tool-calls.tsx` do.
- CopilotKit hard-codes greys (message prose, input, send and toolbar buttons, floating surfaces) and darkens them only under `.dark`, so `globals.css` overrides them by `data-testid`; its utilities sit in `@layer utilities`, so the unlayered overrides win but must restate hover and disabled states.
- The user's bubble is `--muted` (raised) plus a hairline `box-shadow` from `globals.css`; the chat's own background is the page paper.
- Check every chat change in both color schemes; a new CopilotKit element usually brings its own hard-coded grey.

## Checking the design

- Look at screenshots of the running app in light and dark, at desktop (1440 wide) and phone (390 wide) widths, before calling a UI change done; Playwright's `colorScheme` and `viewport` context options cover all four.
- The demo user (`npm run db:seed`) has open, overdue, due-today, and done todos plus a chat history, which shows most states at once.
