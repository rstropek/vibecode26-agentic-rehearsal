import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/libsql/node";
import { oauthClient, oauthClientResource } from "@/db/schema";

// The browser side of connecting an MCP client to /api/mcp: the authorization request sends a signed-out user through
// sign-in or sign-up and back, to the consent page, and from there to the client's redirect URI. The token exchange
// and the tools are covered by app/api/mcp/route.test.ts. Real clients identify themselves with a Client ID Metadata
// Document, which the server would fetch over HTTPS, so this test writes a client into the e2e database instead.

const clientId = `e2e-client-${randomUUID()}`;
const redirectUri = "http://127.0.0.1:43123/callback";

test.beforeAll(async ({ request }) => {
  // Any request to the auth handler makes Better Auth seed the MCP resource the client is linked to.
  expect(
    (await request.get("/.well-known/oauth-protected-resource")).ok(),
  ).toBe(true);
  const baseURL = test.info().project.use.baseURL;
  const db = drizzle({
    connection: { url: process.env.E2E_DATABASE_URL ?? "" },
  });
  await db.insert(oauthClient).values({
    id: randomUUID(),
    clientId,
    name: "E2E Client",
    redirectUris: [redirectUri],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    requirePKCE: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(oauthClientResource).values({
    id: randomUUID(),
    clientId,
    resourceId: `${baseURL}/api/mcp`,
    createdAt: new Date(),
  });
  db.$client.close();
});

// Starts the client's authorization request, as an MCP client opens it in the browser.
async function authorize(page: Page): Promise<void> {
  const baseURL = test.info().project.use.baseURL;
  const challenge = createHash("sha256")
    .update(randomBytes(32).toString("base64url"))
    .digest("base64url");
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "todos",
    state: "e2e-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${baseURL}/api/mcp`,
  });
  await page.goto(`/api/auth/oauth2/authorize?${query}`);
}

// The client's redirect URI is a local listener in real clients; here the browser's request to it is answered directly.
async function callback(page: Page): Promise<URLSearchParams> {
  const reached = page.waitForRequest((request) =>
    request.url().startsWith(redirectUri),
  );
  await page.route(`${redirectUri}**`, (route) =>
    route.fulfill({ body: "Back in the app." }),
  );
  return new URL((await reached).url()).searchParams;
}

test("a new user signs up during the authorization and allows the app", async ({
  page,
}) => {
  const params = callback(page);
  await authorize(page);
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("App Connector");
  await page.getByLabel("Email").fill(`connector-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Let E2E Client in?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();

  const result = await params;
  expect(result.get("code")).toEqual(expect.any(String));
  expect(result.get("state")).toBe("e2e-state");
});

test("an existing user signs in during the authorization and denies the app", async ({
  page,
}) => {
  const email = `denier-${Date.now()}@example.com`;
  const password = "correct-horse-battery";
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "Careful Human", email, password },
  });
  expect(signUp.ok()).toBe(true);
  await page.context().clearCookies();

  const params = callback(page);
  await authorize(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Let E2E Client in?" }),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Deny" }).click();

  const result = await params;
  expect(result.get("error")).toBe("access_denied");
  expect(result.get("code")).toBeNull();
});

test("a consent link that was tampered with is refused", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Link Fiddler");
  await page.getByLabel("Email").fill(`fiddler-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/consent?client_id=${clientId}&scope=todos&sig=forged`);
  await expect(
    page.getByRole("heading", { level: 1, name: "That didn't work." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
});
