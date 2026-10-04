import "server-only";

// Lissie's LLM, via OpenRouter. Mastra's model router reads OPENROUTER_API_KEY from the server environment,
// so the key never reaches the browser. Its own module so tests can swap in a mock model.
export const lissieModel = `openrouter/${process.env.OPENROUTER_MODEL || "z-ai/glm-5.3-flash"}`;
