import { expect, test } from "@playwright/test";

// The chat on / without calling the model; e2e/chat.model.spec.ts talks to Lissie for real.
test("the chat on / connects to the user's own thread without running Lissie", async ({
  page,
}) => {
  const runtimeCalls: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/copilotkit")) {
      runtimeCalls.push(`${request.method()} ${pathname}`);
    }
  });
  const connected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/copilotkit/agent/lissie/connect") &&
      response.status() === 200,
  );

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Chat Fan");
  await page.getByLabel("Email").fill(`chat-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hi, Chat Fan." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(
    page.getByPlaceholder("Tell Lissie what needs doing"),
  ).toBeVisible();
  await connected;

  // Loading the page replays history; only sending a message runs the model.
  expect(runtimeCalls).not.toContainEqual(expect.stringMatching(/\/run$/));
});

test("the runtime refuses requests without a session", async ({ request }) => {
  const response = await request.get("/api/copilotkit/info");
  expect(response.status()).toBe(401);
});
