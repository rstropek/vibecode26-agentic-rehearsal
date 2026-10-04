import { expect, test } from "@playwright/test";

// Calls the real model through OpenRouter, so it runs only with `npm run test:e2e:model`, never in QA or CI.
test("Lissie adds a todo, the sidebar shows it, and her tool call survives a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Milk Fan");
  await page.getByLabel("Email").fill(`milk-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);

  const open = page
    .getByRole("complementary", { name: "Your list" })
    .getByRole("region", { name: /^Open/ });
  await expect(open).toContainText("Nothing open");

  const input = page.getByPlaceholder("Tell Lissie what needs doing");
  await input.fill('Please add "buy milk" to my list.');
  // The chat accepts input once it has connected to the thread.
  await expect(page.getByTestId("copilot-send-button")).toBeEnabled();
  await input.press("Enter");

  // The tool call shows as one line in the chat, and the sidebar refreshes without a reload.
  const toolCall = page
    .getByTestId("lissie-tool-call")
    .filter({ hasText: /Added “buy milk”/i });
  await expect(toolCall).toBeVisible({ timeout: 90_000 });
  await expect(
    open.getByRole("listitem").filter({ hasText: /buy milk/i }),
  ).toBeVisible();
  // She comments on what she added; the toolbar appears once her reply has finished streaming.
  await expect(page.getByTestId("copilot-assistant-toolbar")).toBeVisible({
    timeout: 90_000,
  });

  // The call comes back from Mastra memory after a reload, not from the browser.
  await page.reload();
  await expect(toolCall).toBeVisible();
  await expect(
    open.getByRole("listitem").filter({ hasText: /buy milk/i }),
  ).toBeVisible();
});
