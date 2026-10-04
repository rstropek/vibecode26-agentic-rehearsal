import { expect, test } from "@playwright/test";

// Calls the real model through OpenRouter, so it runs only with `npm run test:e2e:model`, never in QA or CI.
test("Lissie answers and the conversation survives a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Model Fan");
  await page.getByLabel("Email").fill(`model-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);

  const question =
    "I need to file my taxes by Friday and buy cat food. What should I do first?";
  const input = page.getByPlaceholder("Tell Lissie what needs doing");
  await input.fill(question);
  // The chat accepts input once it has connected to the thread.
  await expect(page.getByTestId("copilot-send-button")).toBeEnabled();
  await input.press("Enter");

  await expect(page.getByTestId("copilot-user-message")).toContainText(
    question,
  );
  // The toolbar appears once the reply has finished streaming.
  const reply = page.getByTestId("copilot-assistant-message");
  await expect(page.getByTestId("copilot-assistant-toolbar")).toBeVisible({
    timeout: 90_000,
  });
  const answer = (await reply.innerText()).trim();
  expect(answer.length).toBeGreaterThan(0);
  // GLM's reasoning stays on the server (lib/lissie.ts), so the chat shows only her answer.
  await expect(page.getByText(/^Thought for/)).toHaveCount(0);

  // History comes back from Mastra memory, not from the browser.
  await page.reload();
  await expect(page.getByTestId("copilot-user-message")).toContainText(
    question,
  );
  await expect(reply).toContainText(answer.slice(0, 40));
});
