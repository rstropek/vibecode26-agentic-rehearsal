# Product

<!-- impeccable:product-schema 1 -->

Facts marked _(inferred)_ come from the code and tech docs, not from a confirmed answer.

## Platform

web

## Users

- Busy people with a cat and too many errands, keeping a personal to-do list.
- They add todos, check them off, and ask Lissie about the list, on desktop and on the phone.
- Second audience: AI agents working for one of those people, through the `todo-cat` CLI or its MCP server (`todo-cat mcp --stdio`). They need stable, scriptable output, not personality.

## Product Purpose

- todo-cat is a to-do list kept by Lissie, a cat with attitude, whom the user chats with next to the list itself.
- The job is the list: get errands out of the head, see what is open, overdue, or due today, and scratch them off.
- Lissie makes the list easier to keep up with: she reads, adds, and completes todos on request and helps decide what comes first, what can wait, and how to break a big task down.
- Success _(inferred)_: the user keeps coming back to an up-to-date list because it is quick to use and Lissie is fun to deal with.

## Positioning

- A to-do list with a keeper who has a personality: Lissie is dry, superior, and secretly caring, and she actually changes the list instead of only talking about it.
- The same list is reachable three ways, all on one todo service: the web app (list plus chat), the REST API, and the CLI with its MCP server.

## Operating Context

- The home page `/` is the working surface: Lissie's chat and the list side by side from `lg`, the list below the chat on smaller screens.
- One ongoing conversation per user, remembered across visits; Lissie's changes show up in the list right away.
- Sign-up and sign-in are email and password; `/device` is where a signed-in user approves a `todo-cat login` code from a terminal.
- Agents use the `todo-cat` CLI (and its `todo-cat-cli` skill) as REST clients, with JSON output, stable error and exit codes, and no prompts.

## Capabilities and Constraints

- A todo has a title, an optional due date (a calendar day), and is open or done; each user sees only their own todos.
- Built: add, check off, reopen, and delete in the list; Lissie lists, adds, and completes or reopens todos; the CLI also edits and deletes.
- Not built yet: editing a todo's title or due date in the web app, Lissie renaming, rescheduling, or deleting, and MCP over HTTP.
- Deliberately absent: sharing lists between users, pagination, soft delete.
- Lissie only talks about the list and getting things done; she declines everything else in character.
- "Today" is the server's date, for both the list and Lissie.

## Brand Commitments

- Name: todo-cat, lowercase. The cat is Lissie.
- Lissie's voice: dry, superior, unhurried, secretly caring; short sentences, plain text, no emoji, an occasional cat habit. She comments on every todo she adds or completes, and feeding the cat is the most important task on any list.
- The voice belongs in headlines, empty states, and Lissie's own replies _(inferred from tech-docs/ui.md)_; buttons and labels stay plain ("Add", "Delete", "Keep").
- Security copy stays plain and serious even in character, such as the warning on `/device` never to approve a code someone else sent.

## Evidence on Hand

- The demo user (`npm run db:seed`) has open, overdue, due-today, and done todos plus a chat history.
- No pictures or illustrations of Lissie, no logo beyond the text wordmark, no testimonials, user numbers, or pricing exist; don't invent them.

## Product Principles

- The list comes first: Lissie decorates and helps, but adding and checking off never waits on her or the model.
- Attitude, never obstruction: Lissie may tease, but she always does what was asked and tells the truth about what changed.
- One list, many doors: the web app, CLI, and agents see the same todos with the same rules.
- Quick on the phone and on desktop: the everyday actions take one or two taps or keystrokes.

## Accessibility & Inclusion

- _(inferred from the code)_ Follows the system light or dark preference, honors reduced motion, and manages keyboard focus in the list (such as the inline delete confirmation); keep all three.
