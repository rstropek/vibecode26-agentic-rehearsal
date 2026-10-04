import { expect, test } from "@playwright/test";

// The list next to the chat, without calling the model: todos come in through the REST API with the browser's
// session cookie. e2e/todos.model.spec.ts has Lissie change the list for real.
test("the sidebar shows the user's open and done todos", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("List Fan");
  await page.getByLabel("Email").fill(`list-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);

  const list = page.getByRole("complementary", { name: "Your list" });
  const open = list.getByRole("region", { name: /^Open/ });
  const done = list.getByRole("region", { name: /^Done/ });
  await expect(open).toContainText("Nothing open");
  await expect(done).toContainText("Nothing done yet");

  const add = (data: object) =>
    page.request.post("/api/todos", { data }).then(async (response) => {
      expect(response.status()).toBe(201);
      return (await response.json()) as { id: string };
    });
  await add({ title: "Buy milk", dueDate: "2026-10-09" });
  const feed = await add({ title: "Feed the cat" });
  const patched = await page.request.patch(`/api/todos/${feed.id}`, {
    data: { done: true },
  });
  expect(patched.status()).toBe(200);

  await page.reload();
  await expect(open.getByRole("listitem")).toHaveText([
    "Buy milkDue Fri, Oct 9",
  ]);
  await expect(done.getByRole("listitem")).toHaveText(["Feed the cat"]);
});
