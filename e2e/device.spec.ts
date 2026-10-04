import { expect, test } from "@playwright/test";

// The page `todo-cat login` points to; the CLI side of the flow is covered by cli/src/cli.test.ts.
test("a new user signs up from the device page and approves a CLI login", async ({
  page,
  request,
}) => {
  const codeResponse = await request.post("/api/auth/device/code", {
    data: { client_id: "todo-cat-cli" },
  });
  expect(codeResponse.ok()).toBe(true);
  const code = await codeResponse.json();

  // Signed out, the verification link goes through sign-up and comes back with the code.
  await page.goto(`/device?user_code=${code.user_code}`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Terminal Fan");
  await page.getByLabel("Email").fill(`terminal-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Let the terminal in?" }),
  ).toBeVisible();
  await expect(
    page.getByText(`${code.user_code.slice(0, 4)}-${code.user_code.slice(4)}`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Fine. The terminal is in." }),
  ).toBeVisible();

  // The CLI's next poll gets a session token.
  const tokenResponse = await request.post("/api/auth/device/token", {
    data: {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: code.device_code,
      client_id: "todo-cat-cli",
    },
  });
  expect(tokenResponse.ok()).toBe(true);
  expect(await tokenResponse.json()).toMatchObject({
    access_token: expect.any(String),
    token_type: "Bearer",
  });
});

test("an unknown code shows an error and the code form", async ({ page }) => {
  await page.goto("/signup?next=/device");
  await page.getByLabel("Name").fill("Code Typo");
  await page.getByLabel("Email").fill(`typo-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Got a code?" }),
  ).toBeVisible();
  await page.getByLabel("Code").fill("ZZZZ-ZZZZ");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Lissie doesn't know that code" }),
  ).toBeVisible();
});
