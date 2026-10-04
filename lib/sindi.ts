import "server-only";
import { A2AAgent } from "@mastra/core/a2a";

// Sindi, the dog next door: a separate Mastra app (sindi/) that Lissie delegates dog errands to over A2A; see
// tech-docs/a2a.md. Mastra offers her to Lissie's model as the tool `agent-sindi`, described by `description` below,
// since the remote card is fetched only on the first call.
export const sindi = new A2AAgent({
  id: "sindi",
  name: "Sindi",
  description:
    "Sindi, the dog next door. Runs errands that need a dog, such as fetching the ball, barking at the mailman, or guarding the porch, and reports how it went.",
  url: `${process.env.SINDI_URL || "http://localhost:4111"}/api/.well-known/sindi/agent-card.json`,
  // A dog that never comes back would leave the chat hanging; past this, the delegation fails and Lissie says so.
  timeoutMs: 60_000,
});
