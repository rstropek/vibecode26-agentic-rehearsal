import { beforeAll, expect, test, vi } from "vitest";

// Sindi's A2A agent card, served by the same Hono app `mastra dev` runs, but in-process: no port, no model call.

let app: Awaited<
  ReturnType<typeof import("@mastra/deployer/server").createHonoServer>
>;

beforeAll(async () => {
  // Her traces would otherwise go to a sindi.db file in the working directory.
  vi.stubEnv("SINDI_DATABASE_URL", ":memory:");
  const { createHonoServer } = await import("@mastra/deployer/server");
  const { mastra } = await import("../src/mastra/index");
  app = await createHonoServer(mastra, { tools: {} });
});

test("publishes Sindi's agent card for A2A v0.3", async () => {
  const response = await app.request(
    "http://localhost:4111/api/.well-known/sindi/agent-card.json",
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    protocolVersion: "0.3.0",
    name: "sindi",
    description: expect.stringContaining("errands that need a dog"),
    url: "http://localhost:4111/api/a2a/sindi",
    version: expect.any(String),
    capabilities: { streaming: true },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [],
  });
});

test("serves no card for an agent she does not have", async () => {
  const response = await app.request(
    "http://localhost:4111/api/.well-known/lissie/agent-card.json",
  );

  expect(response.ok).toBe(false);
});
