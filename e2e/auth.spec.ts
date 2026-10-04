import { expect, test } from "@playwright/test";

test("signs up, signs out, and signs back in", async ({ page }) => {
  const email = `lissie-${Date.now()}@example.com`;
  const password = "correct-horse-battery";

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Lissie Fan");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hi, Lissie Fan." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Next.js renders its own empty role="alert" route announcer, so match the form error by its text.
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid email or password" }),
  ).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hi, Lissie Fan." }),
  ).toBeVisible();
});
