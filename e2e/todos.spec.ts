import { expect, type Page, test } from "@playwright/test";
import { formatDueDate } from "../lib/due-date";

// The list next to the chat, without calling the model. e2e/todos.model.spec.ts has Lissie change the list for real.

async function signUp(page: Page, name: string) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page
    .getByLabel("Email")
    .fill(`${name.toLowerCase().replace(" ", "-")}-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);
}

function sections(page: Page) {
  const list = page.getByRole("complementary", { name: "Your list" });
  return {
    list,
    open: list.getByRole("region", { name: /^Open/ }),
    done: list.getByRole("region", { name: /^Done/ }),
  };
}

// Far enough ahead that the todo is never overdue when the test runs.
const dueDate = "2099-10-09";

test("the list shows todos written elsewhere, such as through the REST API", async ({
  page,
}) => {
  await signUp(page, "List Fan");
  const { open, done } = sections(page);
  await expect(open).toContainText("Nothing open");
  await expect(done).toContainText("Nothing scratched off yet");

  const add = (data: object) =>
    page.request.post("/api/todos", { data }).then(async (response) => {
      expect(response.status()).toBe(201);
      return (await response.json()) as { id: string };
    });
  await add({ title: "Buy milk", dueDate });
  const feed = await add({ title: "Feed the cat" });
  const patched = await page.request.patch(`/api/todos/${feed.id}`, {
    data: { done: true },
  });
  expect(patched.status()).toBe(200);

  await page.reload();
  await expect(open.getByRole("listitem")).toHaveText([
    `Buy milkDue ${formatDueDate(dueDate)}`,
  ]);
  await expect(done.getByRole("listitem")).toHaveText(["Feed the cat"]);
});

test("adds a todo with a due date, checks it off, reopens it, and deletes it after confirming", async ({
  page,
}) => {
  await signUp(page, "Click Fan");
  const { list, open, done } = sections(page);

  await list.getByLabel("New todo").fill("Buy the good tuna");
  await list.getByLabel("Due").fill(dueDate);
  await list.getByRole("button", { name: "Add", exact: true }).click();
  await expect(open.getByRole("listitem")).toHaveText([
    `Buy the good tunaDue ${formatDueDate(dueDate)}`,
  ]);
  await expect(list.getByLabel("New todo")).toHaveValue("");

  await list.getByLabel("New todo").fill("Feed the cat");
  await list.getByLabel("New todo").press("Enter");
  await expect(open.getByRole("listitem")).toHaveCount(2);

  // Checking a todo scratches it off, then moves it to Done.
  await open.getByRole("checkbox", { name: "Feed the cat" }).check();
  await expect(done.getByRole("listitem")).toHaveText(["Feed the cat"]);
  await expect(
    done.getByRole("checkbox", { name: "Feed the cat" }),
  ).toBeChecked();
  await expect(
    done.getByRole("checkbox", { name: "Feed the cat" }),
  ).toBeFocused();
  await expect(open.getByRole("listitem")).toHaveCount(1);

  // Unchecking moves the todo back to Open at once, so click and look there (uncheck() would wait on the old row).
  await done.getByRole("checkbox", { name: "Feed the cat" }).click();
  await expect(
    open.getByRole("checkbox", { name: "Feed the cat" }),
  ).not.toBeChecked();
  await expect(open.getByRole("listitem")).toHaveCount(2);
  await expect(done).toContainText("Nothing scratched off yet");

  // Delete asks first; Keep leaves the todo alone.
  await open.getByRole("button", { name: "Delete Buy the good tuna" }).click();
  const confirm = open.getByRole("group", {
    name: "Delete Buy the good tuna?",
  });
  await expect(confirm.getByRole("button", { name: "Keep" })).toBeFocused();
  await confirm.getByRole("button", { name: "Keep" }).click();
  await expect(confirm).toBeHidden();
  await expect(open.getByRole("listitem")).toHaveCount(2);

  await open.getByRole("button", { name: "Delete Buy the good tuna" }).click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(open.getByRole("listitem")).toHaveText(["Feed the cat"]);

  // Every change went through the todo service, so it survives a reload and the REST API sees it. The list shows
  // changes before the server has them, and is busy until it does.
  await expect(list).toHaveAttribute("aria-busy", "false");
  await page.reload();
  await expect(open.getByRole("listitem")).toHaveText(["Feed the cat"]);
  const response = await page.request.get("/api/todos");
  const todos = (await response.json()) as { title: string; done: boolean }[];
  expect(todos.map(({ title, done }) => ({ title, done }))).toEqual([
    { title: "Feed the cat", done: false },
  ]);
});
