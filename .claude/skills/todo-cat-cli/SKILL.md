---
name: todo-cat-cli
description: Manage a person's to-do list with the `todo-cat` CLI (the todo-cat app's REST client) or its MCP tools - add, find, edit, complete, reopen, and delete todos, and answer questions about the list such as what is overdue, due this week, added last week, or finished recently. Use this whenever the user talks about their todos, tasks, to-do list, reminders, or "my list" in the todo-cat project, even if they don't mention the CLI, and whenever you need to read or change todo data on a running todo-cat server.
---

# Managing a to-do list with the todo-cat CLI

The `todo-cat` CLI is how you act on a person's to-do list: it talks to the todo-cat server over HTTP as the signed-in user.
This skill covers workflows and pitfalls; `todo-cat --help` and `todo-cat <command> --help` are the source of truth for commands, options, and exit codes, so when they disagree with this skill, follow the help.

From the repo root run it as `npx todo-cat`; elsewhere it may be installed as `todo-cat`.
`TODO_CAT_URL` picks the server (default `http://localhost:3000`).

## CLI or MCP tools

`todo-cat mcp --stdio` serves the same commands as MCP tools with the same names (`whoami`, `list`, `show`, `add`, `edit`, `done`, `reopen`, `delete`).
If those tools are available to you (in Claude Code they appear as `mcp__todo-cat__list` and so on), use them instead of the shell; everything in this skill applies to both, with these differences:

- Arguments are JSON with the `--json` field names: `add` takes `{"title": "...", "dueDate": "yyyy-mm-dd"}`, `edit` takes `{"id": "...", "title": "...", "dueDate": null}` (null removes the due date), and `list` takes `{"status": "open", "search": "vet"}`.
- A result is the same JSON value `--json` prints, so filter it yourself instead of with jq.
- There is no `--yes`: `delete` is annotated as destructive, and your host may ask the person to confirm. That does not loosen the rules below; delete only what they asked to delete.
- A failure comes back as a tool error with `{"error":{"code":"…","message":"…"}}` instead of an exit code; the codes are the same.
- `login` and `logout` are not tools. A tool error with code `unauthorized` means the person has to run `npx todo-cat login` in a terminal (see below); the server picks up the new login without a restart.

If the person wants the tools and does not have them yet, they can register the server in Claude Code from the repo root with `claude mcp add todo-cat -- npx todo-cat mcp --stdio`; registering it is their call, like logging in.

## Before anything else: are you logged in?

Run `todo-cat whoami --json` first.
It prints the server and the user whose list you are about to touch, and exit code 3 (`unauthorized`) means there is no valid session.

When you are not logged in, stop and tell the user, for example:

> I'm not logged in to todo-cat at http://localhost:3000, so I can't see your list. Run `npx todo-cat login`: it prints a one-time code and a URL; open the URL, sign in, and approve the code. Or tell me to start the login and I'll show you the code.

If they ask you to start it, run `todo-cat login` in the background, show them the code and URL exactly as printed, and wait for the command to exit 0 before continuing.

Logging in is the person's decision because it grants you access to their account, so never work around a missing session.
That means no signing up or signing in with credentials you found (including the seeded demo user), no reading the token store or the database, no calling `/api/todos` or `/api/auth` with curl, and no editing files to get a session.

Exit code 6 (`server-unreachable`) means the server is not running at that URL; tell the user (in this repo `npm run dev` starts it) rather than guessing another URL.

## Find the todo before you act on an id

`done`, `reopen`, `edit`, `show`, and `delete` take the todo's id, a UUID, and people talk about titles.
So look the todo up first, then act on the exact id you found:

```bash
todo-cat list --search vet --json | jq -r '.[] | [.id, .done, .dueDate, .title] | @tsv'
```

- Exactly one match: use its id.
- Several matches: if the request settles it (e.g. only one is still open and they said "I did it"), use that one and say which; otherwise show the candidates and ask.
- No match: `--search` is a plain case-insensitive substring, so try a shorter or different word, or scan the full list, before telling the user it is not there.

Never invent, shorten, or reuse an id from memory; ids come from `list` output in this session.
Exit code 4 (`todo-not-found`) means the id does not exist for this user, which usually means the id was wrong, not that you should retry with a guess; an id that is not a UUID at all fails earlier with exit code 5 (`validation-failed`).

## Answer questions with `--json` and jq

For any question about the list (how many, which, when), fetch it once with `todo-cat list --json` and filter with jq instead of reading the text table by eye.
Each todo looks like this:

```json
{"id":"…","title":"Renew passport","dueDate":"2026-11-03","done":false,"createdAt":"2026-09-29T07:00:00.000Z","completedAt":null}
```

`--status open|done|all` and `--search` filter on the server; jq does everything else:

```bash
today=$(date +%F)
# open and overdue
todo-cat list --status open --json | jq --arg t "$today" '[.[] | select(.dueDate != null and .dueDate < $t)]'
# open and without a due date
todo-cat list --status open --json | jq '[.[] | select(.dueDate == null)] | length'
```

`yyyy-mm-dd` strings compare correctly as strings, and the timestamps are ISO 8601 in UTC, so a prefix such as `.createdAt[0:10]` gives the UTC day.

## Due dates, creation dates, and "last week"

A todo carries three different dates, and phrases like "last week" can mean any of them:

| The person asks about… | Field |
| --- | --- |
| what is (or was) due, overdue, coming up | `dueDate` (a calendar day, may be `null`) |
| what they added, wrote down, put on the list | `createdAt` (timestamp) |
| what they finished, ticked off, got done | `completedAt` (timestamp, `null` while open) |

Pick the field the wording points to; if it is genuinely ambiguous ("what about last week?"), answer for the likeliest one and say which you used.
Todos without a due date never count as due in any range, so mention them separately when that matters.

Get today's date from the shell (`date +%F`), not from your own sense of time.
Turn relative ranges into explicit dates and state them in the answer, e.g. "last week (Mon 2026-09-21 to Sun 2026-09-27)"; use Monday-to-Sunday weeks unless the person's wording or locale says otherwise.
For new due dates, compute the day with `date -d 'next friday' +%F` (GNU date) and pass it as `--due yyyy-mm-dd`; the CLI rejects anything else with exit code 5 (`validation-failed`).

## Changing todos

- Quote titles: `todo-cat add "Schedule Lissie's vet checkup" --due 2026-10-09`; the shell would choke on the apostrophe otherwise.
- "I did X", "X is done", "tick off X" mean `done`, and "X isn't done after all" means `reopen`; neither is a reason to delete.
- `edit` changes only what you pass: `--title`, `--due`, or `--no-due` to clear the due date.
- Use `--json` on writes when you need the result (e.g. the new todo's id from `add`), and report the outcome in plain words.

## Destructive commands only on request

`delete` is permanent: there is no undo and no trash, which is why it refuses to run without `--yes`.
Delete only when the person asked to delete or remove something, and only the todos they meant.

- Do not delete to "clean up", to fix a typo (use `edit`), or to finish something (use `done`).
- For a bulk request ("clear out everything I finished"), list what will go and get a yes before deleting more than the person clearly named.
- `logout` ends the session the person approved; run it only when they ask.

If you created todos only to try something out, delete exactly those ids before you finish, and nothing else.

## Errors

With `--json`, errors arrive on stderr as `{"error":{"code":"…","message":"…"}}`.
Branch on the exit code or `code`, never on the message text; the table is at the end of `todo-cat --help`.
