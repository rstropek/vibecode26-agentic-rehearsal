import "server-only";
import { A2AAgent } from "@mastra/core/a2a";
import type { DelegationConfig } from "@mastra/core/agent";

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

// Sindi lives outside this app, so she gets the errand the model wrote and nothing else. Mastra would forward the
// parent conversation (the user's chat and todos) as context and any `instructions` the model adds, and A2AAgent puts
// both into the prompt it sends her. A hook that throws fails the delegation instead of sending the unfiltered context.
export const errandOnly: DelegationConfig = {
  onDelegationStart: () => ({ modifiedInstructions: "" }),
  messageFilter: () => [],
  hookErrorStrategy: "throw",
};
